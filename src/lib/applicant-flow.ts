import { randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, processedApplications } from "@/drizzle/schema";
import {
  buildAuthorizeUrl,
  exchangeCodeForUserInfo,
  type OAuthProviderName,
} from "@/lib/oauth";
import type { ApplicantAuthProvider } from "@/lib/applicant-types";
import { deleteCv, storeCv, validatePdf } from "@/lib/cv-storage";
import { hashEmail } from "@/lib/email-hash";
import { notifyReviewersOfNewApplication } from "@/lib/slack";

export class ValidationError extends Error {}

function str(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
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

/** Drafts that never completed OAuth are expected litter — swept before every new draft is created. */
export async function sweepOldDrafts(): Promise<void> {
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
}

export async function createApplicationDraft(
  provider: OAuthProviderName,
  formData: FormData,
  redirectUri: string,
): Promise<string> {
  await sweepOldDrafts();

  const linkedinUrl = str(formData.get("linkedinUrl"));
  const positionStatement = str(formData.get("positionStatement"));
  const organisation = str(formData.get("organisation"));
  const comments = str(formData.get("comments"));
  const newsletterOptIn = formData.get("newsletterOptIn") === "on";
  const cvFile = formData.get("cv");

  const applicationId = randomUUID();
  let cvBlobKey: string | null = null;

  if (cvFile instanceof File && cvFile.size > 0) {
    await validatePdf(cvFile);
    cvBlobKey = await storeCv(applicationId, cvFile);
  }

  if (!linkedinUrl && !cvBlobKey && !positionStatement) {
    if (cvBlobKey) await deleteCv(cvBlobKey);
    throw new ValidationError(
      "Provide at least one of LinkedIn URL, CV, or position statement",
    );
  }

  const stateToken = randomUUID();

  await db.insert(applications).values({
    id: applicationId,
    organisation,
    linkedinUrl,
    cvBlobKey,
    positionStatement,
    comments,
    newsletterOptIn,
    authProvider: provider,
    stateToken,
    status: "draft",
  });

  return buildAuthorizeUrl(provider, { redirectUri, state: stateToken });
}

/** Mint a fresh state token for a draft stuck in `auth_error`, without making the applicant retype the form. */
export async function retryApplicationDraft(
  token: string,
  provider: OAuthProviderName,
): Promise<string | null> {
  const [draft] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.stateToken, token), eq(applications.status, "draft")));

  if (!draft) return null;

  const stateToken = randomUUID();
  await db
    .update(applications)
    .set({ stateToken, authProvider: provider, authError: null })
    .where(eq(applications.id, draft.id));

  const redirectUri = `${requireSiteUrl()}/api/auth/${provider}/callback`;
  return buildAuthorizeUrl(provider, { redirectUri, state: stateToken });
}

function requireSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) throw new Error("Missing required env var: NEXT_PUBLIC_SITE_URL");
  return url;
}

export async function handleOAuthCallback(
  provider: OAuthProviderName,
  params: { code: string | null; error: string | null; state: string | null },
  redirectUri: string,
): Promise<string> {
  const { code, error, state } = params;

  if (!state) return "/?error=invalid#contact";

  const [draft] = await db
    .select()
    .from(applications)
    .where(eq(applications.stateToken, state));

  if (!draft || draft.status !== "draft") {
    return "/?error=invalid#contact";
  }

  const staleCutoff = new Date(Date.now() - 60 * 60 * 1000);
  if (draft.createdAt < staleCutoff) {
    return "/?error=expired#contact";
  }

  if (error) {
    await db
      .update(applications)
      .set({ authError: error })
      .where(eq(applications.id, draft.id));
    return `/apply/retry?token=${state}`;
  }

  if (!code) return "/?error=invalid#contact";

  const userInfo = await exchangeCodeForUserInfo(provider, { code, redirectUri });

  // Resubmission check 1: applicant already has a pending application under this identity.
  const [existingPending] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.providerId, userInfo.sub),
        eq(applications.authProvider, provider),
        eq(applications.status, "pending"),
      ),
    );

  if (existingPending) {
    await db
      .update(applications)
      .set({
        organisation: draft.organisation,
        positionStatement: draft.positionStatement,
        comments: draft.comments,
        linkedinUrl: draft.linkedinUrl,
        cvBlobKey: draft.cvBlobKey,
        newsletterOptIn: draft.newsletterOptIn,
      })
      .where(eq(applications.id, existingPending.id));

    if (existingPending.cvBlobKey && existingPending.cvBlobKey !== draft.cvBlobKey) {
      await deleteCv(existingPending.cvBlobKey);
    }
    await db.delete(applications).where(eq(applications.id, draft.id));

    const [updated] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, existingPending.id));
    if (updated) await notifySlackBestEffort(updated, provider);

    return "/apply/success";
  }

  // Resubmission check 2: applicant was previously decided (peppered hash lookup, no PII retained).
  const emailHash = hashEmail(userInfo.email);
  const [processed] = await db
    .select()
    .from(processedApplications)
    .where(eq(processedApplications.emailHash, emailHash));

  if (processed?.outcome === "approved") {
    if (draft.cvBlobKey) await deleteCv(draft.cvBlobKey);
    await db.delete(applications).where(eq(applications.id, draft.id));
    return "/apply/success";
  }

  let resultApplicationId = draft.id;
  try {
    await db
      .update(applications)
      .set({
        name: userInfo.name,
        email: userInfo.email,
        pictureUrl: userInfo.picture,
        providerId: userInfo.sub,
        status: "pending",
        stateToken: null,
        priorRejectionId: processed?.outcome === "rejected" ? processed.id : null,
      })
      .where(eq(applications.id, draft.id));
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;

    // Two tabs/devices raced to complete OAuth for the same identity — the other request won.
    const [raceWinner] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.providerId, userInfo.sub),
          eq(applications.authProvider, provider),
          eq(applications.status, "pending"),
        ),
      );
    if (!raceWinner) throw err;

    await db
      .update(applications)
      .set({
        organisation: draft.organisation,
        positionStatement: draft.positionStatement,
        comments: draft.comments,
        linkedinUrl: draft.linkedinUrl,
        cvBlobKey: draft.cvBlobKey,
        newsletterOptIn: draft.newsletterOptIn,
      })
      .where(eq(applications.id, raceWinner.id));

    if (raceWinner.cvBlobKey && raceWinner.cvBlobKey !== draft.cvBlobKey) {
      await deleteCv(raceWinner.cvBlobKey);
    }
    await db.delete(applications).where(eq(applications.id, draft.id));
    resultApplicationId = raceWinner.id;
  }

  const [finalRow] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, resultApplicationId));
  if (finalRow) await notifySlackBestEffort(finalRow, provider);

  return "/apply/success";
}

/**
 * No-OAuth fallback: applicant just types a name + email, no identity proof
 * at all. There's no draft/redirect round trip to manage (nothing external
 * to wait on), so this goes straight from form submission to a pending row —
 * same resubmission/reapplication logic as the OAuth callback, just sourcing
 * "identity" from the form itself instead of a verified provider. Admin UI
 * must flag these rows as fully unverified (weaker than the Google case,
 * which at least proves *a* real email account).
 */
export async function submitManualApplication(formData: FormData): Promise<string> {
  await sweepOldDrafts();

  const name = str(formData.get("name"));
  const email = str(formData.get("email"));
  const linkedinUrl = str(formData.get("linkedinUrl"));
  const positionStatement = str(formData.get("positionStatement"));
  const organisation = str(formData.get("organisation"));
  const comments = str(formData.get("comments"));
  const newsletterOptIn = formData.get("newsletterOptIn") === "on";
  const cvFile = formData.get("cv");

  if (!name || !email) {
    throw new ValidationError("Name and email are required");
  }

  const applicationId = randomUUID();
  let cvBlobKey: string | null = null;

  if (cvFile instanceof File && cvFile.size > 0) {
    await validatePdf(cvFile);
    cvBlobKey = await storeCv(applicationId, cvFile);
  }

  if (!linkedinUrl && !cvBlobKey && !positionStatement) {
    if (cvBlobKey) await deleteCv(cvBlobKey);
    throw new ValidationError(
      "Provide at least one of LinkedIn URL, CV, or position statement",
    );
  }

  // No OAuth `sub` to key on — the normalized email is the closest thing to
  // a stable identity for this path, scoped to auth_provider = 'email'.
  const normalizedEmail = email.toLowerCase();
  const providerId = normalizedEmail;

  const selfReportedFields = {
    organisation,
    positionStatement,
    comments,
    linkedinUrl,
    cvBlobKey,
    newsletterOptIn,
    name,
  };

  // Resubmission check 1: applicant already has a pending application under this email.
  const [existingPending] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.providerId, providerId),
        eq(applications.authProvider, "email"),
        eq(applications.status, "pending"),
      ),
    );

  if (existingPending) {
    await db
      .update(applications)
      .set(selfReportedFields)
      .where(eq(applications.id, existingPending.id));

    if (existingPending.cvBlobKey && existingPending.cvBlobKey !== cvBlobKey) {
      await deleteCv(existingPending.cvBlobKey);
    }

    const [updated] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, existingPending.id));
    if (updated) await notifySlackBestEffort(updated, "email");

    return "/apply/success";
  }

  // Resubmission check 2: applicant was previously decided (peppered hash lookup, no PII retained).
  const emailHash = hashEmail(normalizedEmail);
  const [processed] = await db
    .select()
    .from(processedApplications)
    .where(eq(processedApplications.emailHash, emailHash));

  if (processed?.outcome === "approved") {
    if (cvBlobKey) await deleteCv(cvBlobKey);
    return "/apply/success";
  }

  let resultApplicationId: string = applicationId;
  try {
    await db.insert(applications).values({
      id: applicationId,
      ...selfReportedFields,
      authProvider: "email",
      name,
      email: normalizedEmail,
      pictureUrl: null,
      providerId,
      status: "pending",
      priorRejectionId: processed?.outcome === "rejected" ? processed.id : null,
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;

    // Two tabs raced to submit the same email at once — the other request won.
    const [raceWinner] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.providerId, providerId),
          eq(applications.authProvider, "email"),
          eq(applications.status, "pending"),
        ),
      );
    if (!raceWinner) throw err;

    await db
      .update(applications)
      .set(selfReportedFields)
      .where(eq(applications.id, raceWinner.id));

    if (raceWinner.cvBlobKey && raceWinner.cvBlobKey !== cvBlobKey) {
      await deleteCv(raceWinner.cvBlobKey);
    }
    resultApplicationId = raceWinner.id;
  }

  const [finalRow] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, resultApplicationId));
  if (finalRow) await notifySlackBestEffort(finalRow, "email");

  return "/apply/success";
}
