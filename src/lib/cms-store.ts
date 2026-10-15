import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cmsDrafts, cmsRoles } from "@/drizzle/schema";
import type { CmsPermission } from "@/cms/access";

/**
 * Database reads and writes for CMS drafts and roles. Callers check permissions first
 * (`src/lib/cms-access.ts`); nothing here does.
 */

export type DraftRow = typeof cmsDrafts.$inferSelect;

export async function getDraft(page: string): Promise<DraftRow | null> {
  const [row] = await db.select().from(cmsDrafts).where(eq(cmsDrafts.page, page));
  return row ?? null;
}

export async function listDrafts(): Promise<DraftRow[]> {
  return db.select().from(cmsDrafts).orderBy(asc(cmsDrafts.page));
}

type DraftWrite = { page: string; content: unknown; baseHash: string; valid: boolean; authorEmail: string };

/**
 * Saves a draft if it is still at `version` (0: the page has no draft yet). Returns the new
 * version, or null when another save got there first.
 */
export async function writeDraft(draft: DraftWrite, version: number): Promise<number | null> {
  if (version === 0) {
    const [row] = await db
      .insert(cmsDrafts)
      .values({ ...draft, version: 1 })
      .onConflictDoNothing()
      .returning({ version: cmsDrafts.version });
    return row?.version ?? null;
  }
  const [row] = await db
    .update(cmsDrafts)
    .set({
      content: draft.content,
      valid: draft.valid,
      authorEmail: draft.authorEmail,
      version: version + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(cmsDrafts.page, draft.page), eq(cmsDrafts.version, version)))
    .returning({ version: cmsDrafts.version });
  return row?.version ?? null;
}

/** Deletes a draft if it is still at `version`. Returns whether it did. */
export async function deleteDraft(page: string, version: number): Promise<boolean> {
  const rows = await db
    .delete(cmsDrafts)
    .where(and(eq(cmsDrafts.page, page), eq(cmsDrafts.version, version)))
    .returning({ page: cmsDrafts.page });
  return rows.length > 0;
}

export async function listCmsRoles(): Promise<{ email: string; permission: CmsPermission }[]> {
  return db.select({ email: cmsRoles.email, permission: cmsRoles.permission }).from(cmsRoles);
}

/** Gives a person a permission, or removes theirs with null. */
export async function setStoredCmsPermission(email: string, permission: CmsPermission | null, grantedBy: string): Promise<void> {
  const key = email.toLowerCase();
  if (permission === null) {
    await db.delete(cmsRoles).where(eq(cmsRoles.email, key));
    return;
  }
  await db
    .insert(cmsRoles)
    .values({ email: key, permission, grantedBy, grantedAt: new Date() })
    .onConflictDoUpdate({ target: cmsRoles.email, set: { permission, grantedBy, grantedAt: new Date() } });
}
