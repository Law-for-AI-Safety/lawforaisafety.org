import { db } from "@/lib/db";
import { adminAuditLog } from "@/drizzle/schema";

type AuditAction = (typeof adminAuditLog.$inferInsert)["action"];

/**
 * Best-effort by design: a failed audit write is logged loudly but never
 * undoes or blocks the admin action it describes — by the time this runs the
 * decision email may already be sent, and failing the request then would
 * leave the UI claiming something didn't happen that did.
 */
export async function recordAdminAction(entry: {
  actorEmail: string;
  action: AuditAction;
  subjectEmailHash?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(adminAuditLog).values({
      actorEmail: entry.actorEmail,
      action: entry.action,
      subjectEmailHash: entry.subjectEmailHash ?? null,
      detail: entry.detail ?? null,
    });
  } catch (err) {
    console.error(`[audit] Failed to record "${entry.action}" by ${entry.actorEmail}`, err);
  }
}
