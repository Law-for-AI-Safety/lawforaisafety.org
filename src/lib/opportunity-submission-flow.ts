import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { opportunitySubmissions } from "@/drizzle/schema";
import {
  buildAuthorizeUrl,
  exchangeCodeForUserInfo,
  UnverifiedEmailError,
  type OAuthProviderName,
} from "@/lib/oauth";
import type { ApplicantAuthProvider } from "@/lib/applicant-types";
import {
  sendAdminNewOpportunitySubmissionEmail,
  sendOpportunitySubmissionConfirmationEmail,
  sendOpportunitySubmissionPublishedEmail,
  sendOpportunitySubmissionRejectedEmail,
} from "@/lib/email";
import { notifyReviewersOfNewOpportunitySubmission } from "@/lib/slack";
import { isProductionDeploy } from "@/lib/deploy-context";
import { OPPORTUNITY_TYPES, type OpportunityType } from "@/opportunities/kinds";
import { isRealCalendarDate } from "@/opportunities/schema";
import type { Opportunity } from "@/opportunities/types";

// Same shape as red-lines-flow.ts: a draft is saved before identity is confirmed, and only
// becomes visible to the team ("pending") once the submitter has signed in with LinkedIn or
// Google, or used the link emailed to the address they typed. Its own table, callback routes
// and redirect URI registrations, for the reasons in red-lines-flow.ts's opening note.

/** `code` is the `?error=` value SubmitErrorBanner shows a message for. */
export type SubmissionValidationErrorCode =
  | "validation"
  | "toolong"
  | "url"
  | "date"
  | "eventdate"
  | "name"
  | "email"
  | "sendfailed";

export class SubmissionValidationError extends Error {
  constructor(
    message: string,
    public readonly code: SubmissionValidationErrorCode = "validation",
  ) {
    super(message);
  }
}

export class SubmissionNotFoundError extends Error {}

const MAX_LENGTHS = {
  sourceUrl: 500,
  applyUrl: 500,
  title: 200,
  org: 200,
  location: 200,
  description: 5000,
  note: 2000,
  authError: 200,
  name: 200,
  email: 320,
  rejectionReason: 2000,
} as const;

const SUBMIT_PATH = "/opportunities/submit";
const EMAIL_CONFIRM_TTL_MS = 24 * 60 * 60 * 1000;
// Confirmation emails go to whatever address was typed, so cap how many one address can be
// sent in a day regardless of who is asking.
const MAX_EMAIL_DRAFTS_PER_DAY = 3;

export type SubmissionRow = typeof opportunitySubmissions.$inferSelect;

function str(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function text(formData: FormData, field: keyof typeof MAX_LENGTHS): string | null {
  const value = str(formData.get(field));
  if (value && value.length > MAX_LENGTHS[field]) {
    throw new SubmissionValidationError(`${field} is too long`, "toolong");
  }
  return value;
}

/**
 * The admin pages show these as links, so they have to be web addresses: anything else (a
 * `javascript:` URL) would put a script one click away from an admin.
 */
function webUrl(formData: FormData, field: "sourceUrl" | "applyUrl"): string | null {
  const value = text(formData, field);
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SubmissionValidationError(`${field} is not a URL`, "url");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new SubmissionValidationError(`${field} is not a web address`, "url");
  }
  return url.toString();
}

function isoDate(formData: FormData, field: "deadline" | "startDate" | "endDate"): string | null {
  const value = str(formData.get(field));
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isRealCalendarDate(value)) {
    throw new SubmissionValidationError(`${field} is not a date`, "date");
  }
  return value;
}

function opportunityType(formData: FormData): OpportunityType | null {
  const value = str(formData.get("type"));
  return value && (OPPORTUNITY_TYPES as readonly string[]).includes(value) ? (value as OpportunityType) : null;
}

/**
 * The form has two modes. "link" sends just an address for the team to write up; "listing"
 * fills in the short form, where the team still adds the structured details (country,
 * compensation, tags, summary) when publishing.
 */
function parseFields(formData: FormData) {
  const note = text(formData, "note");
  const type = opportunityType(formData);

  if (formData.get("mode") === "link") {
    const sourceUrl = webUrl(formData, "sourceUrl");
    if (!sourceUrl) throw new SubmissionValidationError("A link is required");
    return { sourceUrl, type, note };
  }

  const title = text(formData, "title");
  const org = text(formData, "org");
  const applyUrl = webUrl(formData, "applyUrl");
  const description = text(formData, "description");
  if (!type || !title || !org || !applyUrl || !description) {
    throw new SubmissionValidationError("Type, title, organisation, link and description are required");
  }

  const startDate = isoDate(formData, "startDate");
  const endDate = isoDate(formData, "endDate");
  if (type === "event" && !startDate) {
    throw new SubmissionValidationError("An event needs its date", "eventdate");
  }
  if (startDate && endDate && endDate < startDate) {
    throw new SubmissionValidationError("End date is before the start date", "date");
  }

  return {
    sourceUrl: webUrl(formData, "sourceUrl"),
    type,
    title,
    org,
    applyUrl,
    location: text(formData, "location"),
    remote: formData.get("remote") === "on",
    deadline: isoDate(formData, "deadline"),
    startDate,
    endDate,
    description,
    note,
  };
}

function requireSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) throw new Error("Missing required env var: NEXT_PUBLIC_SITE_URL");
  return url;
}

/** How a submission is named in emails, Slack and the admin list. */
export function describeSubmission(row: Pick<SubmissionRow, "title" | "org" | "sourceUrl">): string {
  if (row.title && row.org) return `${row.title} at ${row.org}`;
  return row.title ?? row.sourceUrl ?? "a listing";
}

function authProviderLabel(provider: ApplicantAuthProvider): string {
  if (provider === "linkedin") return "LinkedIn";
  if (provider === "google") return "Google";
  return "email link";
}

/**
 * Drafts never confirmed are expected litter, as in the application flows: swept hourly (see
 * /api/cron/sweep) and before every new draft as a backstop.
 */
export async function sweepOldSubmissionDrafts(): Promise<number> {
  const cutoff = new Date(Date.now() - EMAIL_CONFIRM_TTL_MS);
  const deleted = await db
    .delete(opportunitySubmissions)
    .where(and(eq(opportunitySubmissions.status, "draft"), lt(opportunitySubmissions.createdAt, cutoff)))
    .returning({ id: opportunitySubmissions.id });
  return deleted.length;
}

export async function createSubmissionDraft(
  provider: OAuthProviderName,
  formData: FormData,
  redirectUri: string,
): Promise<{ authorizeUrl: string; state: string }> {
  await sweepOldSubmissionDrafts();

  const fields = parseFields(formData);
  const stateToken = randomUUID();

  await db.insert(opportunitySubmissions).values({
    ...fields,
    authProvider: provider,
    stateToken,
    status: "draft",
  });

  return {
    authorizeUrl: buildAuthorizeUrl(provider, { redirectUri, state: stateToken }),
    state: stateToken,
  };
}

/** Mint a fresh state token for a draft stuck in an auth error, without making the submitter retype the form. */
export async function retrySubmissionDraft(
  token: string,
  provider: OAuthProviderName,
): Promise<{ authorizeUrl: string; state: string } | null> {
  const [draft] = await db
    .select()
    .from(opportunitySubmissions)
    .where(
      and(
        eq(opportunitySubmissions.stateToken, token),
        eq(opportunitySubmissions.status, "draft"),
        // An email-path draft's token is an email confirmation token, not an OAuth one.
        or(eq(opportunitySubmissions.authProvider, "linkedin"), eq(opportunitySubmissions.authProvider, "google")),
      ),
    );
  if (!draft) return null;

  const stateToken = randomUUID();
  await db
    .update(opportunitySubmissions)
    .set({ stateToken, authProvider: provider, authError: null })
    .where(eq(opportunitySubmissions.id, draft.id));

  const redirectUri = `${requireSiteUrl()}/api/opportunities/submit/${provider}/callback`;
  return {
    authorizeUrl: buildAuthorizeUrl(provider, { redirectUri, state: stateToken }),
    state: stateToken,
  };
}

async function notifyBestEffort(row: SubmissionRow): Promise<void> {
  const submitterName = row.name ?? "Unknown";
  const what = describeSubmission(row);

  try {
    await notifyReviewersOfNewOpportunitySubmission({
      submitterName,
      what,
      authProvider: row.authProvider,
      submissionId: row.id,
    });
  } catch {
    // Best-effort — a Slack outage shouldn't fail the submitter-facing flow.
  }

  try {
    await sendAdminNewOpportunitySubmissionEmail({
      submitterName,
      what,
      authProviderLabel: authProviderLabel(row.authProvider),
      submissionId: row.id,
    });
  } catch (err) {
    console.error(`Admin notification email failed for opportunity submission ${row.id}:`, err);
  }
}

type ConfirmedIdentity = {
  /** OAuth `sub` on those paths, the normalised email address on the email path. */
  providerId: string;
  name: string;
  email: string;
};

/** Hands a draft to the team once its submitter's identity is confirmed, by either path. */
async function completeSubmission(
  draft: SubmissionRow,
  identity: ConfirmedIdentity,
  provider: ApplicantAuthProvider,
): Promise<string> {
  const [row] = await db
    .update(opportunitySubmissions)
    .set({
      name: identity.name.slice(0, MAX_LENGTHS.name),
      email: identity.email,
      providerId: identity.providerId,
      authProvider: provider,
      status: "pending",
      stateToken: null,
    })
    .where(and(eq(opportunitySubmissions.id, draft.id), eq(opportunitySubmissions.status, "draft")))
    .returning();
  // Another tab completed this same draft first; it has already notified the team.
  if (row) await notifyBestEffort(row);
  return `${SUBMIT_PATH}?submitted=1`;
}

export async function handleSubmissionOAuthCallback(
  provider: OAuthProviderName,
  params: {
    code: string | null;
    error: string | null;
    state: string | null;
    stateMatchesCookie: boolean;
  },
  redirectUri: string,
): Promise<string> {
  const { code, error, state, stateMatchesCookie } = params;

  // Without the cookie match, this sign-in was started in another browser: someone may have
  // sent this person a link to confirm *their* draft with.
  if (!state || !stateMatchesCookie) return `${SUBMIT_PATH}?error=invalid`;

  const [draft] = await db.select().from(opportunitySubmissions).where(eq(opportunitySubmissions.stateToken, state));
  if (!draft || draft.status !== "draft" || draft.authProvider !== provider) {
    return `${SUBMIT_PATH}?error=invalid`;
  }

  const staleCutoff = new Date(Date.now() - 60 * 60 * 1000);
  if (draft.createdAt < staleCutoff) return `${SUBMIT_PATH}?error=expired`;

  const sendToRetry = async (authError: string) => {
    await db
      .update(opportunitySubmissions)
      .set({ authError: authError.slice(0, MAX_LENGTHS.authError) })
      .where(eq(opportunitySubmissions.id, draft.id));
    return `${SUBMIT_PATH}/retry?token=${encodeURIComponent(state)}`;
  };

  if (error) return sendToRetry(error);
  if (!code) return `${SUBMIT_PATH}?error=invalid`;

  let userInfo;
  try {
    userInfo = await exchangeCodeForUserInfo(provider, { code, redirectUri });
  } catch (err) {
    if (err instanceof UnverifiedEmailError) return sendToRetry("email_unverified");
    throw err;
  }

  return completeSubmission(draft, { providerId: userInfo.sub, name: userInfo.name, email: userInfo.email }, provider);
}

/**
 * Email path, step 1 of 2: the submitter types a name and email. Nothing here proves they hold
 * that address, so the submission is parked as a draft and a confirmation link is emailed;
 * step 2 (confirmManualSubmission) runs when it is used.
 */
export async function submitManualSubmission(formData: FormData): Promise<string> {
  await sweepOldSubmissionDrafts();

  const name = text(formData, "name");
  const email = text(formData, "email");
  const fields = parseFields(formData);

  if (!name || !email) throw new SubmissionValidationError("Name and email are required");
  // The name ends up in an email greeting and a Slack message. Both escape it, but there's
  // no reason for a name to contain markup in the first place.
  if (/[<>]/.test(name)) throw new SubmissionValidationError("Name contains invalid characters", "name");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new SubmissionValidationError("Email address is not valid", "email");
  }

  const normalizedEmail = email.toLowerCase();
  const confirmRedirect = `${SUBMIT_PATH}?submitted=confirm`;

  // Same response whether or not we send — says nothing about the address, and a flood aimed
  // at one inbox stops at three.
  const [{ count: recentDrafts }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(opportunitySubmissions)
    .where(
      and(
        eq(opportunitySubmissions.authProvider, "email"),
        eq(opportunitySubmissions.status, "draft"),
        eq(opportunitySubmissions.email, normalizedEmail),
        gt(opportunitySubmissions.createdAt, new Date(Date.now() - EMAIL_CONFIRM_TTL_MS)),
      ),
    );
  if (recentDrafts >= MAX_EMAIL_DRAFTS_PER_DAY) return confirmRedirect;

  const submissionId = randomUUID();
  const confirmationToken = randomUUID();

  await db.insert(opportunitySubmissions).values({
    id: submissionId,
    ...fields,
    authProvider: "email",
    name,
    email: normalizedEmail,
    stateToken: confirmationToken,
    status: "draft",
  });

  const confirmUrl = `${requireSiteUrl()}${SUBMIT_PATH}/confirm?token=${confirmationToken}`;
  try {
    await sendOpportunitySubmissionConfirmationEmail(normalizedEmail, name, confirmUrl);
  } catch (err) {
    console.error(`Opportunity submission confirmation email failed for draft ${submissionId}:`, err);
    await db.delete(opportunitySubmissions).where(eq(opportunitySubmissions.id, submissionId));
    throw new SubmissionValidationError("Could not send confirmation email", "sendfailed");
  }

  // Outside production, mail only goes to admin addresses (see email.ts) — surface the link so
  // the flow can still be walked through locally.
  if (!isProductionDeploy()) {
    console.log(`[opportunity-submit] Confirmation link for draft ${submissionId}: ${confirmUrl}`);
  }

  return confirmRedirect;
}

/** Email path, step 2 of 2: the emailed link was used, so the address is confirmed. */
export async function confirmManualSubmission(token: string): Promise<string> {
  const [draft] = await db
    .select()
    .from(opportunitySubmissions)
    .where(
      and(
        eq(opportunitySubmissions.stateToken, token),
        eq(opportunitySubmissions.status, "draft"),
        eq(opportunitySubmissions.authProvider, "email"),
      ),
    );

  if (!draft || !draft.email || !draft.name) return `${SUBMIT_PATH}?error=invalid`;
  if (draft.createdAt < new Date(Date.now() - EMAIL_CONFIRM_TTL_MS)) return `${SUBMIT_PATH}?error=expired`;

  return completeSubmission(draft, { providerId: draft.email, name: draft.name, email: draft.email }, "email");
}

// --- Admin side ---

/** Every confirmed submission, the ones still to review first, then the newest. */
export async function listSubmissions(): Promise<SubmissionRow[]> {
  return db
    .select()
    .from(opportunitySubmissions)
    .where(inArray(opportunitySubmissions.status, ["pending", "published", "rejected"]))
    .orderBy(sql`${opportunitySubmissions.status} <> 'pending'`, desc(opportunitySubmissions.createdAt));
}

export async function countPendingSubmissions(): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(opportunitySubmissions)
    .where(eq(opportunitySubmissions.status, "pending"));
  return count;
}

/** Ids come from URLs; anything not shaped like one would make Postgres throw rather than find nothing. */
function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** A confirmed submission; drafts are never shown to the team. */
export async function getSubmission(id: string): Promise<SubmissionRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(opportunitySubmissions)
    .where(and(eq(opportunitySubmissions.id, id), inArray(opportunitySubmissions.status, ["pending", "published", "rejected"])));
  return row ?? null;
}

/** A pending submission, or a NotFound for anything already decided, so it can't be published twice. */
export async function requirePendingSubmission(id: string): Promise<SubmissionRow> {
  const row = await getSubmission(id);
  if (!row || row.status !== "pending") throw new SubmissionNotFoundError();
  return row;
}

/**
 * Records that `opportunity` was published from this submission, and tells the submitter. The
 * email is best effort: the listing is already live, and a failed send shouldn't report the
 * publish as failed.
 */
export async function markSubmissionPublished(id: string, opportunity: Opportunity, actorEmail: string): Promise<void> {
  const [row] = await db
    .update(opportunitySubmissions)
    .set({ status: "published", opportunityId: opportunity.id, reviewedAt: new Date(), reviewedBy: actorEmail })
    .where(and(eq(opportunitySubmissions.id, id), eq(opportunitySubmissions.status, "pending")))
    .returning();
  if (!row?.email) return;

  try {
    await sendOpportunitySubmissionPublishedEmail(
      row.email,
      row.name,
      `${opportunity.title} at ${opportunity.org}`,
      `${requireSiteUrl()}/opportunities/${opportunity.slug}`,
    );
  } catch (err) {
    console.error(`Published email failed for opportunity submission ${row.id}:`, err);
  }
}

/**
 * Rejects a pending submission, and emails the submitter only when the admin asks to. A failed
 * send leaves the rejection in place and is reported back (`emailFailed`), since the admin
 * asked for that email and may want to write to the submitter by hand.
 */
export async function rejectSubmission(
  id: string,
  actorEmail: string,
  { notify, reason }: { notify: boolean; reason: string | null },
): Promise<{ emailed: boolean; emailFailed: boolean }> {
  const trimmedReason = reason?.trim() || null;
  if (trimmedReason && trimmedReason.length > MAX_LENGTHS.rejectionReason) {
    throw new SubmissionValidationError("The reason is too long", "toolong");
  }
  if (!isUuid(id)) throw new SubmissionNotFoundError();

  const [row] = await db
    .update(opportunitySubmissions)
    .set({ status: "rejected", rejectionReason: trimmedReason, reviewedAt: new Date(), reviewedBy: actorEmail })
    .where(and(eq(opportunitySubmissions.id, id), eq(opportunitySubmissions.status, "pending")))
    .returning();
  if (!row) throw new SubmissionNotFoundError();
  if (!notify || !row.email) return { emailed: false, emailFailed: false };

  try {
    await sendOpportunitySubmissionRejectedEmail(row.email, row.name, describeSubmission(row), trimmedReason);
    return { emailed: true, emailFailed: false };
  } catch (err) {
    console.error(`Rejection email failed for opportunity submission ${row.id}:`, err);
    return { emailed: false, emailFailed: true };
  }
}
