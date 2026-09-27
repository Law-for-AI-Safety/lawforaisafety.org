import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { redLinesApplications } from "@/drizzle/schema";
import { hashEmail } from "@/lib/email-hash";
import { recordAdminAction } from "@/lib/audit-log";

export class AlreadyReviewedError extends Error {}
export class NotFoundError extends Error {}

type RedLinesRow = typeof redLinesApplications.$inferSelect;

/**
 * Claim the row for this decision, defensively — mirrors admin-flow.ts's
 * applicant equivalent. Unlike that flow, the row is never purged afterward:
 * approved rows are the working group's contact list, rejected rows are
 * deliberately kept as a record of who wasn't invited (see schema.ts).
 *
 * Unlike the volunteer flow, no email is sent here: the working group
 * contacts applicants by hand, so there's no notification step to retry and
 * this is a plain status change.
 */
async function claimPendingApplication(
  id: string,
  status: "approved" | "rejected",
  reviewedBy: string,
  reviewerNotes: string | null,
): Promise<RedLinesRow> {
  const [row] = await db
    .update(redLinesApplications)
    .set({ status, reviewedAt: new Date(), reviewedBy, reviewerNotes })
    .where(and(eq(redLinesApplications.id, id), eq(redLinesApplications.status, "pending")))
    .returning();
  if (row) return row;

  const [existing] = await db
    .select()
    .from(redLinesApplications)
    .where(eq(redLinesApplications.id, id));
  if (!existing) throw new NotFoundError();
  throw new AlreadyReviewedError();
}

async function recordDecision(
  row: RedLinesRow,
  action: "approve" | "reject",
  reviewedBy: string,
): Promise<void> {
  await recordAdminAction({
    actorEmail: reviewedBy,
    action,
    subjectEmailHash: row.email ? hashEmail(row.email) : null,
    detail: { kind: "red_lines" },
  });
}

export async function approveRedLinesApplication(
  id: string,
  reviewedBy: string,
): Promise<{ email: string; name: string | null }> {
  const row = await claimPendingApplication(id, "approved", reviewedBy, null);
  if (!row.email) throw new Error("Approved application missing verified email");
  await recordDecision(row, "approve", reviewedBy);
  return { email: row.email, name: row.name };
}

export async function rejectRedLinesApplication(
  id: string,
  reviewedBy: string,
  reviewerNotes: string | null,
): Promise<{ email: string; name: string | null }> {
  const row = await claimPendingApplication(id, "rejected", reviewedBy, reviewerNotes);
  if (!row.email) throw new Error("Rejected application missing verified email");
  await recordDecision(row, "reject", reviewedBy);
  return { email: row.email, name: row.name };
}

/**
 * Marks that the applicant has been emailed by hand. Not itself an approve
 * or reject action — just a note for the admin list, so re-marking (e.g. a
 * different reviewer follows up later) simply overwrites who/when, no error.
 */
export async function markRedLinesApplicationContacted(
  id: string,
  contactedBy: string,
): Promise<{ contactedBy: string; contactedAt: string }> {
  const [row] = await db
    .update(redLinesApplications)
    .set({ contactedBy, contactedAt: new Date() })
    .where(
      and(
        eq(redLinesApplications.id, id),
        or(
          eq(redLinesApplications.status, "approved"),
          eq(redLinesApplications.status, "rejected"),
        ),
      ),
    )
    .returning({ contactedBy: redLinesApplications.contactedBy, contactedAt: redLinesApplications.contactedAt });

  if (!row || !row.contactedAt) throw new NotFoundError();
  return { contactedBy: row.contactedBy!, contactedAt: row.contactedAt.toISOString() };
}
