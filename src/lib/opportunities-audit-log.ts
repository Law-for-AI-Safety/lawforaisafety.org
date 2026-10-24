import { db } from "@/lib/db";
import { opportunitiesAuditLog } from "@/drizzle/schema";

/**
 * Best-effort by design, same as recordTaskTrackerAction: a failed audit write is logged loudly
 * but never blocks or undoes the write it describes.
 */
export async function recordOpportunityAction(entry: {
  actorEmail: string;
  action: "create" | "update" | "delete";
  entityId: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(opportunitiesAuditLog).values({
      actorEmail: entry.actorEmail,
      action: entry.action,
      entityType: "opportunity",
      entityId: entry.entityId,
      detail: entry.detail ?? null,
    });
  } catch (err) {
    console.error(`[opportunities-audit] Failed to record "${entry.action}" by ${entry.actorEmail}`, err);
  }
}
