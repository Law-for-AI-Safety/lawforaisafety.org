import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications,
  newsletterSignups,
  processedApplications,
} from "@/drizzle/schema";
import { deleteCv } from "@/lib/cv-storage";
import { hashEmail } from "@/lib/email-hash";

/**
 * Erasure requests (GDPR Article 17), keyed by email address.
 *
 * A person's data can be in three places at once, and a request has to reach
 * all of them:
 *
 *   - `applications`, if they have a draft or pending application. Still holds
 *     everything they submitted, plus a CV in blob storage.
 *   - `newsletter_signups`, if they subscribed.
 *   - `processed_applications`, if a decision has already been made. By then
 *     the identifying data is gone and only an HMAC of the email remains,
 *     with the outcome and any rejection notes.
 *
 * The last one is why this works by email rather than by application id: once
 * an application is decided there is no id to look up, and the only way back
 * to the row is to hash an address the requester has proved they control. See
 * the privacy policy's section on exercising rights for why that proof is the
 * email itself rather than an identity document.
 */

export type ErasureFindings = {
  applications: {
    id: string;
    status: string;
    createdAt: string;
    hasCv: boolean;
  }[];
  newsletterSignups: {
    id: string;
    createdAt: string;
    confirmed: boolean;
  }[];
  processed: {
    outcome: string;
    processedAt: string;
    hasReviewerNotes: boolean;
  } | null;
};

export type ErasureResult = {
  applications: number;
  cvs: number;
  newsletterSignups: number;
  processed: number;
};

/**
 * Which of the three holdings to erase.
 *
 * Erasure is per purpose, not all or nothing: someone can ask us to delete
 * their application while staying on the newsletter, or unsubscribe while
 * leaving an application in progress. Those are separate purposes resting on
 * separate legal bases, so the tool has to be able to honour a request
 * without destroying data the person never asked us to touch.
 */
export type ErasureScopes = {
  applications: boolean;
  newsletterSignups: boolean;
  processed: boolean;
};

export const ALL_SCOPES: ErasureScopes = {
  applications: true,
  newsletterSignups: true,
  processed: true,
};

/** Matches `hashEmail`, so a lookup finds the same row the hash was built from. */
function normalise(email: string): string {
  return email.trim().toLowerCase();
}

export function isPlausibleEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length > 3 && trimmed.length <= 320 && /^[^@\s]+@[^@\s]+$/.test(trimmed);
}

/**
 * Stored application and newsletter emails are whatever case the provider or
 * the subscriber gave us, so both are matched case-insensitively rather than
 * on an exact string.
 */
export async function findDataForEmail(
  email: string,
): Promise<ErasureFindings> {
  const address = normalise(email);

  const applicationRows = await db
    .select({
      id: applications.id,
      status: applications.status,
      createdAt: applications.createdAt,
      cvBlobKey: applications.cvBlobKey,
    })
    .from(applications)
    .where(sql`lower(${applications.email}) = ${address}`);

  const newsletterRows = await db
    .select({
      id: newsletterSignups.id,
      createdAt: newsletterSignups.createdAt,
      confirmedAt: newsletterSignups.confirmedAt,
    })
    .from(newsletterSignups)
    .where(sql`lower(${newsletterSignups.email}) = ${address}`);

  const [processedRow] = await db
    .select({
      outcome: processedApplications.outcome,
      processedAt: processedApplications.processedAt,
      reviewerNotes: processedApplications.reviewerNotes,
    })
    .from(processedApplications)
    .where(eq(processedApplications.emailHash, hashEmail(address)));

  return {
    applications: applicationRows.map((row) => ({
      id: row.id,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      hasCv: Boolean(row.cvBlobKey),
    })),
    newsletterSignups: newsletterRows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      confirmed: row.confirmedAt !== null,
    })),
    processed: processedRow
      ? {
          outcome: processedRow.outcome,
          processedAt: processedRow.processedAt.toISOString(),
          hasReviewerNotes: Boolean(processedRow.reviewerNotes),
        }
      : null,
  };
}

/**
 * Deletes the selected holdings, permanently. CV blobs go first: a row deleted
 * before its blob would leave the blob orphaned with no key to find it by,
 * whereas a blob deleted before its row just means the row briefly points at
 * nothing.
 *
 * This does not touch Brevo. Removing someone from the mailing list there is a
 * separate step, and the caller is told so. That matters most when
 * `newsletterSignups` is erased: the row is our record that consent was given
 * and confirmed, so deleting it while the contact stays in Brevo leaves us
 * mailing someone with nothing to demonstrate consent under Article 7(1).
 * Erase the signup and the Brevo contact together, or neither.
 */
export async function eraseDataForEmail(
  email: string,
  scopes: ErasureScopes = ALL_SCOPES,
): Promise<ErasureResult> {
  const address = normalise(email);
  const result: ErasureResult = {
    applications: 0,
    cvs: 0,
    newsletterSignups: 0,
    processed: 0,
  };

  if (scopes.applications) {
    const applicationRows = await db
      .select({ id: applications.id, cvBlobKey: applications.cvBlobKey })
      .from(applications)
      .where(sql`lower(${applications.email}) = ${address}`);

    for (const row of applicationRows) {
      if (row.cvBlobKey) {
        await deleteCv(row.cvBlobKey);
        result.cvs += 1;
      }
    }

    const deleted = await db
      .delete(applications)
      .where(sql`lower(${applications.email}) = ${address}`)
      .returning({ id: applications.id });
    result.applications = deleted.length;
  }

  if (scopes.newsletterSignups) {
    const deleted = await db
      .delete(newsletterSignups)
      .where(sql`lower(${newsletterSignups.email}) = ${address}`)
      .returning({ id: newsletterSignups.id });
    result.newsletterSignups = deleted.length;
  }

  if (scopes.processed) {
    const deleted = await db
      .delete(processedApplications)
      .where(eq(processedApplications.emailHash, hashEmail(address)))
      .returning({ id: processedApplications.id });
    result.processed = deleted.length;
  }

  return result;
}
