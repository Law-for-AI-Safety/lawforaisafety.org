import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, processedApplications } from "@/drizzle/schema";
import { hashEmail } from "@/lib/email-hash";
import { deleteCv } from "@/lib/cv-storage";
import {
  sendApplicationApprovedEmail,
  sendApplicationRejectedEmail,
} from "@/lib/email";
import { recordVerifiedNewsletterOptIn } from "@/lib/newsletter-signup";
import { isAlreadyInSlackWorkspace } from "@/lib/slack";

export class AlreadyReviewedError extends Error {}
export class NotFoundError extends Error {}

function requireSlackWorkspaceUrl(): string {
  const url = process.env.SLACK_WORKSPACE_URL;
  if (!url) throw new Error("Missing required env var: SLACK_WORKSPACE_URL");
  return url;
}

/**
 * Claim the row for this decision, defensively: if two reviewers collide on
 * the same pending application, only the first conditional update wins — the
 * second gets AlreadyReviewedError instead of silently double-processing.
 */
async function claimPendingApplication(
  id: string,
  status: "approved" | "rejected",
  reviewedBy: string,
  reviewerNotes: string | null,
) {
  const [row] = await db
    .update(applications)
    .set({ status, reviewedAt: new Date(), reviewedBy, reviewerNotes })
    .where(and(eq(applications.id, id), eq(applications.status, "pending")))
    .returning();

  if (row) return row;

  const [existing] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, id));
  if (!existing) throw new NotFoundError();
  throw new AlreadyReviewedError();
}

/**
 * A re-decided identity overwrites its prior outcome rather than erroring —
 * email_hash is unique, so a second rejection (or an approval after a prior
 * rejection) must upsert, not insert.
 */
async function upsertProcessedApplication(row: {
  emailHash: string;
  outcome: "approved" | "rejected";
  reviewerNotes: string | null;
}) {
  await db
    .insert(processedApplications)
    .values(row)
    .onConflictDoUpdate({
      target: processedApplications.emailHash,
      set: {
        outcome: row.outcome,
        reviewerNotes: row.reviewerNotes,
        processedAt: new Date(),
      },
    });
}

export async function approveApplication(
  id: string,
  reviewedBy: string,
): Promise<{
  email: string;
  name: string | null;
  alreadyInSlack: boolean;
  slackInviteUrl: string;
}> {
  // Fail fast on missing config before any mutation runs.
  const slackWorkspaceUrl = requireSlackWorkspaceUrl();

  const row = await claimPendingApplication(id, "approved", reviewedBy, null);
  if (!row.email) throw new Error("Approved application missing verified email");

  if (row.newsletterOptIn) {
    await recordVerifiedNewsletterOptIn(row.email);
  }

  const alreadyInSlack = await isAlreadyInSlackWorkspace(row.email);

  await sendApplicationApprovedEmail(row.email);

  await upsertProcessedApplication({
    emailHash: hashEmail(row.email),
    outcome: "approved",
    reviewerNotes: null, // discarded on approval, per spec
  });

  if (row.cvBlobKey) await deleteCv(row.cvBlobKey);

  const email = row.email;
  const name = row.name;

  await db.delete(applications).where(eq(applications.id, id));

  return {
    email,
    name,
    alreadyInSlack,
    slackInviteUrl: `${slackWorkspaceUrl}/admin/invites`,
  };
}

export async function rejectApplication(
  id: string,
  reviewedBy: string,
  reviewerNotes: string | null,
): Promise<void> {
  const row = await claimPendingApplication(id, "rejected", reviewedBy, reviewerNotes);
  if (!row.email) throw new Error("Rejected application missing verified email");

  await sendApplicationRejectedEmail(row.email);

  await upsertProcessedApplication({
    emailHash: hashEmail(row.email),
    outcome: "rejected",
    reviewerNotes,
  });

  if (row.cvBlobKey) await deleteCv(row.cvBlobKey);

  await db.delete(applications).where(eq(applications.id, id));
}
