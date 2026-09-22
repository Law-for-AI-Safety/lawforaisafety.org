import { db } from "@/lib/db";
import { legalAuditLog } from "@/drizzle/schema";

/**
 * Best-effort by design, same as recordAdminAction: a failed audit write is
 * logged loudly but never blocks or undoes the write it describes.
 */
export async function recordLegalAction(entry: {
  actorEmail: string;
  action: string;
  entityType: "project" | "task";
  entityId: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(legalAuditLog).values({
      actorEmail: entry.actorEmail,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      detail: entry.detail ?? null,
    });
  } catch (err) {
    console.error(
      `[legal-audit] Failed to record "${entry.action}" by ${entry.actorEmail}`,
      err,
    );
  }
}
