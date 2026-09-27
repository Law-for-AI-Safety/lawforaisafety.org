import { randomUUID } from "node:crypto";
import { and, eq, gt, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { redLinesApplications } from "@/drizzle/schema";
import {
  buildAuthorizeUrl,
  exchangeCodeForUserInfo,
  UnverifiedEmailError,
  type OAuthProviderName,
} from "@/lib/oauth";
import {
  sendRedLinesApplicationConfirmationEmail,
  sendRedLinesApplicationReceivedEmail,
} from "@/lib/email";
import { notifyReviewersOfNewRedLinesApplication } from "@/lib/slack";
import { isProductionDeploy } from "@/lib/deploy-context";

// This module deliberately mirrors applicant-flow.ts rather than sharing
// code with it: separate table, separate purge/retention rules (see
// schema.ts), separate OAuth callback routes and redirect URI registrations
// per provider. Worth it with two application types (this one and the
// volunteer apply flow); if a third one shows up, reconsider generalising
// the OAuth draft/callback plumbing behind one shared endpoint keyed off
// which table a given `state` token belongs to, per the note in
// oauth-production-setup.md.

/** `code` is the `?error=` value RedLinesErrorBanner shows a message for. */
export type RedLinesValidationErrorCode =
  | "validation"
  | "toolong"
  | "hours"
  | "linkedin"
  | "name"
  | "email"
  | "sendfailed";

export class RedLinesValidationError extends Error {
  constructor(
    message: string,
    public readonly code: RedLinesValidationErrorCode = "validation",
  ) {
    super(message);
  }
}

const MAX_LENGTHS = {
  motivation: 900,
  affiliation: 200,
  publicationExample: 500,
  authError: 200,
  name: 200,
  email: 320,
  linkedinUrl: 300,
} as const;

const MAX_AVAILABLE_HOURS = 1000;
const AREA_VALUES = ["legal_governance", "technical"] as const;
const EU_INTEREST_VALUES = ["yes", "maybe", "no"] as const;

const EMAIL_CONFIRM_TTL_MS = 24 * 60 * 60 * 1000;
// Confirmation emails go to whatever address was typed, so cap how many one
// address can be sent in a day regardless of who is asking.
const MAX_EMAIL_DRAFTS_PER_DAY = 3;

function str(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function text(
  formData: FormData,
  field: keyof typeof MAX_LENGTHS,
): string | null {
  const value = str(formData.get(field));
  if (value && value.length > MAX_LENGTHS[field]) {
    throw new RedLinesValidationError(`${field} is too long`, "toolong");
  }
  return value;
}

function parseArea(
  formData: FormData,
): (typeof AREA_VALUES)[number] {
  const value = str(formData.get("areaOfExpertise"));
  if (!value || !AREA_VALUES.includes(value as (typeof AREA_VALUES)[number])) {
    throw new RedLinesValidationError("Choose an area of expertise");
  }
  return value as (typeof AREA_VALUES)[number];
}

function parseEuInterest(
  formData: FormData,
): (typeof EU_INTEREST_VALUES)[number] {
  const value = str(formData.get("euParliamentInterest"));
  if (
    !value ||
    !EU_INTEREST_VALUES.includes(value as (typeof EU_INTEREST_VALUES)[number])
  ) {
    throw new RedLinesValidationError(
      "Say whether you're interested in visiting the European Parliament",
    );
  }
  return value as (typeof EU_INTEREST_VALUES)[number];
}

function parseHours(formData: FormData): number {
  const raw = str(formData.get("availableHours"));
  const hours = raw ? Number(raw) : NaN;
  if (!raw || !Number.isFinite(hours) || hours < 0 || hours > MAX_AVAILABLE_HOURS) {
    throw new RedLinesValidationError(
      "Enter your available hours as a number",
      "hours",
    );
  }
  return Math.round(hours);
}

/**
 * Optional, self-reported, independent of how identity is verified. The
 * admin view flags it as unverified regardless of `authProvider` — this URL
 * is typed by the applicant, and anyone can open a LinkedIn account in
 * someone else's name (see applicant-flow.ts's identical note).
 */
function parseLinkedinUrl(formData: FormData): string | null {
  const raw = text(formData, "linkedinUrl");
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RedLinesValidationError("LinkedIn URL is not a URL", "linkedin");
  }

  const host = url.hostname.toLowerCase();
  const hostOk = host === "linkedin.com" || host.endsWith(".linkedin.com");
  if (
    url.protocol !== "https:" ||
    !hostOk ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    !url.pathname.startsWith("/in/")
  ) {
    throw new RedLinesValidationError("Not a linkedin.com/in/ profile URL", "linkedin");
  }
  return url.toString();
}

function parseFields(formData: FormData) {
  const motivation = text(formData, "motivation");
  const affiliation = text(formData, "affiliation");
  if (!motivation || !affiliation) {
    throw new RedLinesValidationError(
      "Motivation and affiliation are required",
    );
  }

  return {
    areaOfExpertise: parseArea(formData),
    motivation,
    availableHours: parseHours(formData),
    availableOct12: formData.get("availableOct12") === "on",
    availableNov9: formData.get("availableNov9") === "on",
    availableDec7: formData.get("availableDec7") === "on",
    euParliamentInterest: parseEuInterest(formData),
    affiliation,
    publicationExample: text(formData, "publicationExample"),
    linkedinUrl: parseLinkedinUrl(formData),
  };
}

function requireSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) throw new Error("Missing required env var: NEXT_PUBLIC_SITE_URL");
  return url;
}

/**
 * Drafts that never completed verification (OAuth or the emailed link) are
 * expected litter, same as the volunteer apply flow — swept hourly (see
 * /api/cron/sweep) and before every new draft as a backstop.
 */
export async function sweepOldRedLinesDrafts(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(redLinesApplications)
    .where(
      and(
        eq(redLinesApplications.status, "draft"),
        lt(redLinesApplications.createdAt, cutoff),
      ),
    )
    .returning({ id: redLinesApplications.id });
  return deleted.length;
}

export async function createRedLinesApplicationDraft(
  provider: OAuthProviderName,
  formData: FormData,
  redirectUri: string,
): Promise<{ authorizeUrl: string; state: string }> {
  await sweepOldRedLinesDrafts();

  const fields = parseFields(formData);
  const stateToken = randomUUID();

  await db.insert(redLinesApplications).values({
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

/** Mint a fresh state token for a draft stuck in an auth error, without making the applicant retype the form. */
export async function retryRedLinesApplicationDraft(
  token: string,
  provider: OAuthProviderName,
): Promise<{ authorizeUrl: string; state: string } | null> {
  const [draft] = await db
    .select()
    .from(redLinesApplications)
    .where(
      and(
        eq(redLinesApplications.stateToken, token),
        eq(redLinesApplications.status, "draft"),
        // An email-path draft's token is an email confirmation token, not an
        // OAuth one — nothing to retry here.
        or(
          eq(redLinesApplications.authProvider, "linkedin"),
          eq(redLinesApplications.authProvider, "google"),
        ),
      ),
    );
  if (!draft) return null;

  const stateToken = randomUUID();
  await db
    .update(redLinesApplications)
    .set({ stateToken, authProvider: provider, authError: null })
    .where(eq(redLinesApplications.id, draft.id));

  const redirectUri = `${requireSiteUrl()}/api/red-lines-dialogue/apply/${provider}/callback`;
  return {
    authorizeUrl: buildAuthorizeUrl(provider, { redirectUri, state: stateToken }),
    state: stateToken,
  };
}

async function notifyBestEffort(row: typeof redLinesApplications.$inferSelect): Promise<void> {
  try {
    await notifyReviewersOfNewRedLinesApplication({
      applicantName: row.name ?? "Unknown",
      affiliation: row.affiliation,
      applicationId: row.id,
    });
  } catch {
    // Best-effort — a Slack outage shouldn't fail the applicant-facing flow.
  }
  if (row.email) {
    try {
      await sendRedLinesApplicationReceivedEmail(row.email, row.name);
    } catch (err) {
      console.error(`Red Lines receipt email failed for application ${row.id}:`, err);
    }
  }
}

type ConfirmedIdentity = {
  /** LinkedIn `sub` on that path, the normalised email address on the email path. */
  providerId: string;
  name: string;
  email: string;
  picture: string | null;
};

/**
 * Turns a draft into a pending application once identity is confirmed
 * (LinkedIn OAuth, or the emailed link on the email path). Shared because
 * the resubmission rules are the same either way: an existing row for this
 * identity (pending, approved, or rejected — never purged, see schema.ts)
 * means this is a resubmission, so the new answers are folded into it and
 * it's reopened for review, rather than creating a second record.
 */
async function completeRedLinesApplication(
  draft: typeof redLinesApplications.$inferSelect,
  identity: ConfirmedIdentity,
  provider: OAuthProviderName | "email",
): Promise<string> {
  const [existing] = await db
    .select()
    .from(redLinesApplications)
    .where(eq(redLinesApplications.providerId, identity.providerId));

  const resubmittedFields = {
    areaOfExpertise: draft.areaOfExpertise,
    motivation: draft.motivation,
    availableHours: draft.availableHours,
    availableOct12: draft.availableOct12,
    availableNov9: draft.availableNov9,
    availableDec7: draft.availableDec7,
    euParliamentInterest: draft.euParliamentInterest,
    affiliation: draft.affiliation,
    publicationExample: draft.publicationExample,
    linkedinUrl: draft.linkedinUrl,
    authProvider: provider,
    name: identity.name,
    email: identity.email,
    pictureUrl: identity.picture,
  };

  async function mergeIntoExisting(
    existingId: string,
    draftId: string,
  ): Promise<typeof redLinesApplications.$inferSelect | undefined> {
    const [row] = await db
      .update(redLinesApplications)
      .set({
        ...resubmittedFields,
        status: "pending",
        stateToken: null,
        reviewedAt: null,
        reviewedBy: null,
        reviewerNotes: null,
        contactedBy: null,
        contactedAt: null,
      })
      .where(eq(redLinesApplications.id, existingId))
      .returning();
    if (draftId !== existingId) {
      await db.delete(redLinesApplications).where(eq(redLinesApplications.id, draftId));
    }
    return row;
  }

  let finalRow: typeof redLinesApplications.$inferSelect | undefined;

  if (existing && existing.id !== draft.id) {
    finalRow = await mergeIntoExisting(existing.id, draft.id);
  } else {
    try {
      [finalRow] = await db
        .update(redLinesApplications)
        .set({
          ...resubmittedFields,
          providerId: identity.providerId,
          status: "pending",
          stateToken: null,
        })
        .where(eq(redLinesApplications.id, draft.id))
        .returning();
    } catch (err) {
      // Two tabs raced to complete for the same identity — the other request
      // won and already holds providerId. Fold into its row instead.
      const isUniqueViolation =
        typeof err === "object" && err !== null && "code" in err &&
        (err as { code: unknown }).code === "23505";
      if (!isUniqueViolation) throw err;

      const [raceWinner] = await db
        .select()
        .from(redLinesApplications)
        .where(eq(redLinesApplications.providerId, identity.providerId));
      if (!raceWinner) throw err;

      finalRow = await mergeIntoExisting(raceWinner.id, draft.id);
    }
  }

  if (finalRow) await notifyBestEffort(finalRow);

  return "/red-lines-dialogue?applied=1#apply";
}

export async function handleRedLinesOAuthCallback(
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

  if (!state || !stateMatchesCookie) {
    return "/red-lines-dialogue?error=invalid#apply";
  }

  const [draft] = await db
    .select()
    .from(redLinesApplications)
    .where(eq(redLinesApplications.stateToken, state));

  if (!draft || draft.status !== "draft" || draft.authProvider !== provider) {
    return "/red-lines-dialogue?error=invalid#apply";
  }

  const staleCutoff = new Date(Date.now() - 60 * 60 * 1000);
  if (draft.createdAt < staleCutoff) {
    return "/red-lines-dialogue?error=expired#apply";
  }

  const sendToRetry = async (authError: string) => {
    await db
      .update(redLinesApplications)
      .set({ authError: authError.slice(0, MAX_LENGTHS.authError) })
      .where(eq(redLinesApplications.id, draft.id));
    return `/red-lines-dialogue/retry?token=${encodeURIComponent(state)}`;
  };

  if (error) return sendToRetry(error);
  if (!code) return "/red-lines-dialogue?error=invalid#apply";

  let userInfo;
  try {
    userInfo = await exchangeCodeForUserInfo(provider, { code, redirectUri });
  } catch (err) {
    if (err instanceof UnverifiedEmailError) return sendToRetry("email_unverified");
    throw err;
  }

  return completeRedLinesApplication(
    draft,
    {
      providerId: userInfo.sub,
      name: userInfo.name,
      email: userInfo.email,
      picture: userInfo.picture,
    },
    provider,
  );
}

/**
 * No-OAuth fallback, step 1 of 2: applicant types a name + email. Nothing
 * here proves they hold that address, so nothing here reaches a reviewer or
 * touches an existing application — the submission is parked as a draft and
 * a confirmation link is emailed. Step 2 (confirmManualRedLinesApplication)
 * runs when that link is used. See applicant-flow.ts's identical two-step
 * design for the fuller rationale.
 */
export async function submitManualRedLinesApplication(formData: FormData): Promise<string> {
  await sweepOldRedLinesDrafts();

  const name = text(formData, "name");
  const email = text(formData, "email");
  const fields = parseFields(formData);

  if (!name || !email) {
    throw new RedLinesValidationError("Name and email are required");
  }
  if (/[<>]/.test(name)) {
    throw new RedLinesValidationError("Name contains invalid characters", "name");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new RedLinesValidationError("Email address is not valid", "email");
  }

  const normalizedEmail = email.toLowerCase();
  const confirmRedirect = "/red-lines-dialogue?applied=confirm#apply";

  // Same response whether or not we send — says nothing about the address,
  // and a flood aimed at one inbox stops at three.
  const [{ count: recentDrafts }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(redLinesApplications)
    .where(
      and(
        eq(redLinesApplications.authProvider, "email"),
        eq(redLinesApplications.status, "draft"),
        eq(redLinesApplications.email, normalizedEmail),
        gt(redLinesApplications.createdAt, new Date(Date.now() - EMAIL_CONFIRM_TTL_MS)),
      ),
    );
  if (recentDrafts >= MAX_EMAIL_DRAFTS_PER_DAY) return confirmRedirect;

  const applicationId = randomUUID();
  const confirmationToken = randomUUID();

  await db.insert(redLinesApplications).values({
    id: applicationId,
    ...fields,
    authProvider: "email",
    name,
    email: normalizedEmail,
    stateToken: confirmationToken,
    status: "draft",
  });

  const confirmUrl = `${requireSiteUrl()}/red-lines-dialogue/confirm?token=${confirmationToken}`;
  try {
    await sendRedLinesApplicationConfirmationEmail(normalizedEmail, name, confirmUrl);
  } catch (err) {
    console.error(`Red Lines confirmation email failed for draft ${applicationId}:`, err);
    await db.delete(redLinesApplications).where(eq(redLinesApplications.id, applicationId));
    throw new RedLinesValidationError("Could not send confirmation email", "sendfailed");
  }

  // Outside production, mail only goes to admin addresses (see email.ts) —
  // surface the link so the flow can still be walked through locally.
  if (!isProductionDeploy()) {
    console.log(`[red-lines] Confirmation link for draft ${applicationId}: ${confirmUrl}`);
  }

  return confirmRedirect;
}

/** No-OAuth fallback, step 2 of 2: the emailed link was used, so the address is confirmed. */
export async function confirmManualRedLinesApplication(token: string): Promise<string> {
  const [draft] = await db
    .select()
    .from(redLinesApplications)
    .where(
      and(
        eq(redLinesApplications.stateToken, token),
        eq(redLinesApplications.status, "draft"),
        eq(redLinesApplications.authProvider, "email"),
      ),
    );

  if (!draft || !draft.email || !draft.name) return "/red-lines-dialogue?error=invalid#apply";

  if (draft.createdAt < new Date(Date.now() - EMAIL_CONFIRM_TTL_MS)) {
    return "/red-lines-dialogue?error=expired#apply";
  }

  // No OAuth `sub` to key on — the normalised email is the stable identity
  // for this path, scoped to auth_provider = 'email'.
  return completeRedLinesApplication(
    draft,
    {
      providerId: draft.email,
      name: draft.name,
      email: draft.email,
      picture: null,
    },
    "email",
  );
}
