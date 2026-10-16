import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminAuditLog } from "@/drizzle/schema";

/** Autosaves by one person on one page within this long share one audit row. */
export const DRAFT_EDIT_WINDOW_MS = 30 * 60 * 1000;

/**
 * Records a draft save in the admin audit log without one row per autosave: a save by the
 * same person on the same page within 30 minutes of their last one updates that row's time,
 * latest version and count. Discards, publishes and role changes keep a row each
 * (`recordAdminAction`). Best-effort, like `recordAdminAction`: a failure is logged and never
 * undoes the save.
 */
export async function recordDraftEdit(entry: { actorEmail: string; page: string; version: number; valid: boolean }): Promise<void> {
  const now = new Date();
  try {
    const [recent] = await db
      .select({ id: adminAuditLog.id, detail: adminAuditLog.detail })
      .from(adminAuditLog)
      .where(
        and(
          eq(adminAuditLog.action, "cms_draft_save"),
          eq(adminAuditLog.actorEmail, entry.actorEmail),
          sql`${adminAuditLog.detail}->>'page' = ${entry.page}`,
          gt(adminAuditLog.at, new Date(now.getTime() - DRAFT_EDIT_WINDOW_MS)),
        ),
      )
      .orderBy(desc(adminAuditLog.at))
      .limit(1);
    const detail = { page: entry.page, version: entry.version, valid: entry.valid };
    if (recent) {
      const count = Number((recent.detail as { count?: unknown } | null)?.count) || 1;
      await db
        .update(adminAuditLog)
        .set({ at: now, detail: { ...detail, count: count + 1 } })
        .where(eq(adminAuditLog.id, recent.id));
    } else {
      await db.insert(adminAuditLog).values({ actorEmail: entry.actorEmail, action: "cms_draft_save", at: now, detail: { ...detail, count: 1 } });
    }
  } catch (err) {
    console.error(`[audit] Failed to record a draft edit of "${entry.page}" by ${entry.actorEmail}`, err);
  }
}
