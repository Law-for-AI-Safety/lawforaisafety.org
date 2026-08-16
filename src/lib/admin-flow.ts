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
export class NotificationFailedError extends Error {}

type ApplicationRow = typeof applications.$inferSelect;

function requireSlackWorkspaceUrl(): string {
  const url = process.env.SLACK_WORKSPACE_URL;
  if (!url) throw new Error("Missing required env var: SLACK_WORKSPACE_URL");
  return url;
}

/**
 * Claim the row for this decision, defensively: if two reviewers collide on
 * the same pending application, only the first conditional update wins.
 * Returns null (not an error) if no pending row matched — the caller
 * decides what that means, since it's ambiguous from here alone (could be a
 * retriable failed-notification row, or genuinely already handled).
 */
async function tryClaimPendingApplication(
  id: string,
  status: "approved" | "rejected",
  reviewedBy: string,
  reviewerNotes: string | null,
): Promise<ApplicationRow | null> {
  const [row] = await db
    .update(applications)
    .set({ status, reviewedAt: new Date(), reviewedBy, reviewerNotes })
    .where(and(eq(applications.id, id), eq(applications.status, "pending")))
    .returning();
  return row ?? null;
}

/**
 * Row wasn't pending, so this is either a retry of a decision whose
 * notification email failed last time (actionable), or the row's already
 * been fully processed or doesn't exist (not actionable).
 */
async function getRetriableApplication(
  id: string,
  status: "approved" | "rejected",
): Promise<ApplicationRow> {
  const [existing] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, id));
  if (!existing) throw new NotFoundError();
  if (existing.status !== status || existing.notificationStatus !== "failed") {
    throw new AlreadyReviewedError();
  }
  return existing;
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

async function markNotificationFailed(id: string): Promise<never> {
  await db
    .update(applications)
    .set({ notificationStatus: "failed" })
    .where(eq(applications.id, id));
  throw new NotificationFailedError(
    "Decision saved, but the notification email failed to send. Try again to retry sending it.",
  );
}

async function purgeApplication(
  row: ApplicationRow,
  outcome: "approved" | "rejected",
): Promise<void> {
  await upsertProcessedApplication({
    emailHash: hashEmail(row.email!),
    outcome,
    reviewerNotes: outcome === "rejected" ? row.reviewerNotes : null, // discarded on approval, per spec
  });
  if (row.cvBlobKey) await deleteCv(row.cvBlobKey);
  await db.delete(applications).where(eq(applications.id, row.id));
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

  let row = await tryClaimPendingApplication(id, "approved", reviewedBy, null);
  if (row) {
    if (!row.email) throw new Error("Approved application missing verified email");
    if (row.newsletterOptIn) await recordVerifiedNewsletterOptIn(row.email);
  } else {
    row = await getRetriableApplication(id, "approved");
  }

  const alreadyInSlack = await isAlreadyInSlackWorkspace(row.email!);

  try {
    await sendApplicationApprovedEmail(row.email!, row.name);
  } catch {
    await markNotificationFailed(id);
  }

  await purgeApplication(row, "approved");

  return {
    email: row.email!,
    name: row.name,
    alreadyInSlack,
    slackInviteUrl: `${slackWorkspaceUrl}/admin/invites`,
  };
}

export async function rejectApplication(
  id: string,
  reviewedBy: string,
  reviewerNotes: string | null,
): Promise<void> {
  let row = await tryClaimPendingApplication(id, "rejected", reviewedBy, reviewerNotes);
  if (!row) {
    row = await getRetriableApplication(id, "rejected");
  }
  if (!row.email) throw new Error("Rejected application missing verified email");

  try {
    await sendApplicationRejectedEmail(row.email, row.name);
  } catch {
    await markNotificationFailed(id);
  }

  await purgeApplication(row, "rejected");
}
