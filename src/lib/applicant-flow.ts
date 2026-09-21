import { randomUUID } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, processedApplications } from "@/drizzle/schema";
import {
  buildAuthorizeUrl,
  exchangeCodeForUserInfo,
  UnverifiedEmailError,
  type OAuthProviderName,
} from "@/lib/oauth";
import type { ApplicantAuthProvider } from "@/lib/applicant-types";
import { deleteCv, storeCv, validatePdf } from "@/lib/cv-storage";
import { sendApplicationConfirmationEmail } from "@/lib/email";
import { hashEmail } from "@/lib/email-hash";
import { notifyReviewersOfNewApplication } from "@/lib/slack";

/** `code` is the `?error=` value the contact section shows a message for — see ContactErrorBanner. */
export type ValidationErrorCode =
  | "validation"
  | "toolong"
  | "linkedin"
  | "name"
  | "email"
  | "cv"
  | "sendfailed";

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly code: ValidationErrorCode = "validation",
  ) {
    super(message);
  }
}

// Generous for a real applicant, small enough that nobody can park megabytes
// of text in the database or in a reviewer's browser.
const MAX_LENGTHS = {
  name: 200,
  email: 320,
  organisation: 200,
  linkedinUrl: 300,
  positionStatement: 5000,
  comments: 5000,
  authError: 200,
} as const;

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
    throw new ValidationError(`${field} is too long`, "toolong");
  }
  return value;
}

/**
 * The admin page renders this as a clickable link under the heading
 * "LinkedIn profile URL", so it has to actually be one. Anything else is a
 * way to put a lookalike login page one click away from a reviewer. The
 * browser's `type="url"` check is no defence — a direct POST skips it.
 */
function parseLinkedinUrl(value: string | null): string | null {
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ValidationError("LinkedIn URL is not a URL", "linkedin");
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
    throw new ValidationError("Not a linkedin.com/in/ profile URL", "linkedin");
  }
  return url.toString();
}

function parseSelfReportedFields(formData: FormData) {
  return {
    linkedinUrl: parseLinkedinUrl(text(formData, "linkedinUrl")),
    positionStatement: text(formData, "positionStatement"),
    organisation: text(formData, "organisation"),
    comments: text(formData, "comments"),
    newsletterOptIn: formData.get("newsletterOptIn") === "on",
  };
}

/** Validates and stores the uploaded CV, if there is one. Returns its blob key. */
async function storeCvIfPresent(
  applicationId: string,
  formData: FormData,
): Promise<string | null> {
  const cvFile = formData.get("cv");
  if (!(cvFile instanceof File) || cvFile.size === 0) return null;

  try {
    await validatePdf(cvFile);
  } catch {
    throw new ValidationError("CV must be a PDF under 5 MB", "cv");
  }
  return storeCv(applicationId, cvFile);
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "23505"
  );
}

async function notifySlackBestEffort(
  row: typeof applications.$inferSelect,
  provider: ApplicantAuthProvider,
): Promise<void> {
  try {
    await notifyReviewersOfNewApplication({
      applicantName: row.name ?? "Unknown",
      organisation: row.organisation,
      authProvider: provider,
      applicationId: row.id,
    });
  } catch {
    // Best-effort — a Slack outage shouldn't fail the applicant-facing flow.
  }
}

/**
 * Drafts that never completed OAuth (or never confirmed their email) are
 * expected litter. Swept hourly by the scheduled function (see
 * /api/cron/sweep), and before every new draft as a backstop.
 */
export async function sweepOldDrafts(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(applications)
    .where(and(eq(applications.status, "draft"), lt(applications.createdAt, cutoff)))
    .returning({ cvBlobKey: applications.cvBlobKey });

  await Promise.all(
    deleted
      .filter((row): row is { cvBlobKey: string } => row.cvBlobKey !== null)
      .map((row) => deleteCv(row.cvBlobKey)),
  );
  return deleted.length;
}

/**
 * Returns the provider URL to send the applicant to, plus the `state` it
 * carries — the route sets that as a cookie so the callback can tell it's
 * coming back to the same browser (see oauth-state-cookie.ts).
 */
export async function createApplicationDraft(
  provider: OAuthProviderName,
  formData: FormData,
  redirectUri: string,
): Promise<{ authorizeUrl: string; state: string }> {
  await sweepOldDrafts();

  const fields = parseSelfReportedFields(formData);
  const hasCvUpload =
    formData.get("cv") instanceof File && (formData.get("cv") as File).size > 0;

  if (!fields.linkedinUrl && !hasCvUpload && !fields.positionStatement) {
    throw new ValidationError(
      "Provide at least one of LinkedIn URL, CV, or position statement",
    );
  }

  const applicationId = randomUUID();
  const cvBlobKey = await storeCvIfPresent(applicationId, formData);
  const stateToken = randomUUID();

  await db.insert(applications).values({
    id: applicationId,
    ...fields,
    cvBlobKey,
    authProvider: provider,
    stateToken,
    status: "draft",
  });

  return {
    authorizeUrl: buildAuthorizeUrl(provider, { redirectUri, state: stateToken }),
    state: stateToken,
  };
}

/** Mint a fresh state token for a draft stuck in `auth_error`, without making the applicant retype the form. */
export async function retryApplicationDraft(
  token: string,
  provider: OAuthProviderName,
): Promise<{ authorizeUrl: string; state: string } | null> {
  const [draft] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.stateToken, token), eq(applications.status, "draft")));

  // An email-path draft's token is an email confirmation token, not an OAuth one.
  if (!draft || draft.authProvider === "email") return null;

  const stateToken = randomUUID();
  await db
    .update(applications)
    .set({ stateToken, authProvider: provider, authError: null })
    .where(eq(applications.id, draft.id));

  const redirectUri = `${requireSiteUrl()}/api/auth/${provider}/callback`;
  return {
    authorizeUrl: buildAuthorizeUrl(provider, { redirectUri, state: stateToken }),
    state: stateToken,
  };
}

function requireSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) throw new Error("Missing required env var: NEXT_PUBLIC_SITE_URL");
  return url;
}

type ConfirmedIdentity = {
  /** Stable per-provider id: OAuth `sub`, or the normalised address on the email path. */
  providerId: string;
  name: string;
  email: string;
  picture: string | null;
};

/**
 * Turns a draft into a pending application once the applicant's identity is
 * confirmed (OAuth sign-in, or the emailed link on the email-only path).
 * Shared because the resubmission rules are the same either way — and only
 * safe to share *because* both callers have proof by this point: an existing
 * pending application is overwritten here, which must never happen on
 * nothing more than a typed email address.
 */
async function completeApplication(
  draft: typeof applications.$inferSelect,
  identity: ConfirmedIdentity,
  provider: ApplicantAuthProvider,
): Promise<string> {
  const resubmittedFields = {
    name: identity.name,
    organisation: draft.organisation,
    positionStatement: draft.positionStatement,
    comments: draft.comments,
    linkedinUrl: draft.linkedinUrl,
    cvBlobKey: draft.cvBlobKey,
    newsletterOptIn: draft.newsletterOptIn,
  };

  const findPending = async () => {
    const [row] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.providerId, identity.providerId),
          eq(applications.authProvider, provider),
          eq(applications.status, "pending"),
        ),
      );
    return row ?? null;
  };

  /** Fold the draft into the application this identity already has pending. */
  const mergeInto = async (existing: typeof applications.$inferSelect) => {
    await db
      .update(applications)
      .set(resubmittedFields)
      .where(eq(applications.id, existing.id));

    if (existing.cvBlobKey && existing.cvBlobKey !== draft.cvBlobKey) {
      await deleteCv(existing.cvBlobKey);
    }
    await db.delete(applications).where(eq(applications.id, draft.id));
  };

  // Resubmission check 1: applicant already has a pending application under this identity.
  const existingPending = await findPending();
  let resultApplicationId = draft.id;

  if (existingPending) {
    await mergeInto(existingPending);
    resultApplicationId = existingPending.id;
  } else {
    // Resubmission check 2: applicant was previously decided (peppered hash lookup, no PII retained).
    const [processed] = await db
      .select()
      .from(processedApplications)
      .where(eq(processedApplications.emailHash, hashEmail(identity.email)));

    if (processed?.outcome === "approved") {
      if (draft.cvBlobKey) await deleteCv(draft.cvBlobKey);
      await db.delete(applications).where(eq(applications.id, draft.id));
      return "/?applied=1#contact";
    }

    try {
      await db
        .update(applications)
        .set({
          name: identity.name,
          email: identity.email,
          pictureUrl: identity.picture,
          providerId: identity.providerId,
          status: "pending",
          stateToken: null,
          priorRejectionId: processed?.outcome === "rejected" ? processed.id : null,
        })
        .where(eq(applications.id, draft.id));
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;

      // Two tabs/devices raced to complete for the same identity — the other request won.
      const raceWinner = await findPending();
      if (!raceWinner) throw err;

      await mergeInto(raceWinner);
      resultApplicationId = raceWinner.id;
    }
  }

  const [finalRow] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, resultApplicationId));
  if (finalRow) await notifySlackBestEffort(finalRow, provider);

  return "/?applied=1#contact";
}

export async function handleOAuthCallback(
  provider: OAuthProviderName,
  params: {
    code: string | null;
    error: string | null;
    state: string | null;
    /** Whether `state` equals the cookie set when this browser started the flow. */
    stateMatchesCookie: boolean;
  },
  redirectUri: string,
): Promise<string> {
  const { code, error, state, stateMatchesCookie } = params;

  // Without the cookie match, this sign-in was started somewhere else: someone
  // may have sent this person a link to complete *their* draft with.
  if (!state || !stateMatchesCookie) return "/?error=invalid#contact";

  const [draft] = await db
    .select()
    .from(applications)
    .where(eq(applications.stateToken, state));

  if (!draft || draft.status !== "draft" || draft.authProvider !== provider) {
    return "/?error=invalid#contact";
  }

  const staleCutoff = new Date(Date.now() - 60 * 60 * 1000);
  if (draft.createdAt < staleCutoff) {
    return "/?error=expired#contact";
  }

  const sendToRetry = async (authError: string) => {
    await db
      .update(applications)
      .set({ authError: authError.slice(0, MAX_LENGTHS.authError) })
      .where(eq(applications.id, draft.id));
    return `/apply/retry?token=${encodeURIComponent(state)}`;
  };

  if (error) return sendToRetry(error);
  if (!code) return "/?error=invalid#contact";

  let userInfo;
  try {
    userInfo = await exchangeCodeForUserInfo(provider, { code, redirectUri });
  } catch (err) {
    // Signed in, but the provider won't vouch for the address — the other
    // provider might, so offer the retry page rather than a dead end.
    if (err instanceof UnverifiedEmailError) return sendToRetry("email_unverified");
    throw err;
  }

  return completeApplication(
    draft,
    {
      providerId: userInfo.sub,
      name: userInfo.name.slice(0, MAX_LENGTHS.name),
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
 * a confirmation link is emailed. Step 2 (confirmManualApplication) runs when
 * that link is used, which is what stops anyone applying as, or overwriting
 * the application of, someone whose address they merely know.
 *
 * Even confirmed, this is the weakest path: it proves control of a mailbox
 * and nothing else. Admin UI flags it accordingly.
 */
export async function submitManualApplication(formData: FormData): Promise<string> {
  await sweepOldDrafts();

  const name = text(formData, "name");
  const email = text(formData, "email");
  const fields = parseSelfReportedFields(formData);

  if (!name || !email) {
    throw new ValidationError("Name and email are required");
  }
  // The name ends up in an email greeting and a Slack message. Both escape
  // it, but there's no reason for a name to contain markup in the first place.
  if (/[<>]/.test(name)) {
    throw new ValidationError("Name contains invalid characters", "name");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ValidationError("Email address is not valid", "email");
  }

  const hasCvUpload =
    formData.get("cv") instanceof File && (formData.get("cv") as File).size > 0;
  if (!fields.linkedinUrl && !hasCvUpload && !fields.positionStatement) {
    throw new ValidationError(
      "Provide at least one of LinkedIn URL, CV, or position statement",
    );
  }

  const normalizedEmail = email.toLowerCase();
  const confirmRedirect = "/?applied=confirm#contact";

  // Same response whether or not we send — says nothing about the address,
  // and a flood aimed at one inbox stops at three.
  const [{ count: recentDrafts }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(
      and(
        eq(applications.authProvider, "email"),
        eq(applications.status, "draft"),
        eq(applications.email, normalizedEmail),
        gt(applications.createdAt, new Date(Date.now() - EMAIL_CONFIRM_TTL_MS)),
      ),
    );
  if (recentDrafts >= MAX_EMAIL_DRAFTS_PER_DAY) return confirmRedirect;

  const applicationId = randomUUID();
  const cvBlobKey = await storeCvIfPresent(applicationId, formData);
  const confirmationToken = randomUUID();

  await db.insert(applications).values({
    id: applicationId,
    ...fields,
    cvBlobKey,
    authProvider: "email",
    name,
    email: normalizedEmail,
    stateToken: confirmationToken,
    status: "draft",
  });

  const confirmUrl = `${requireSiteUrl()}/apply/confirm?token=${confirmationToken}`;
  try {
    await sendApplicationConfirmationEmail(normalizedEmail, name, confirmUrl);
  } catch (err) {
    console.error(`Application confirmation email failed for draft ${applicationId}:`, err);
    if (cvBlobKey) await deleteCv(cvBlobKey);
    await db.delete(applications).where(eq(applications.id, applicationId));
    throw new ValidationError("Could not send confirmation email", "sendfailed");
  }

  // Outside production, mail only goes to admin addresses (see email.ts) —
  // surface the link so the flow can still be walked through locally.
  if (process.env.CONTEXT !== "production") {
    console.log(`[apply] Confirmation link for draft ${applicationId}: ${confirmUrl}`);
  }

  return confirmRedirect;
}

/** No-OAuth fallback, step 2 of 2: the emailed link was used, so the address is confirmed. */
export async function confirmManualApplication(token: string): Promise<string> {
  const [draft] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.stateToken, token),
        eq(applications.status, "draft"),
        eq(applications.authProvider, "email"),
      ),
    );

  if (!draft || !draft.email || !draft.name) return "/?error=invalid#contact";

  if (draft.createdAt < new Date(Date.now() - EMAIL_CONFIRM_TTL_MS)) {
    return "/?error=expired#contact";
  }

  // No OAuth `sub` to key on — the normalised email is the stable identity
  // for this path, scoped to auth_provider = 'email'.
  return completeApplication(
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
