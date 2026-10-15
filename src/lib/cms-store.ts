import { and, asc, desc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { cmsDrafts, cmsRoles, cmsSubmissions } from "@/drizzle/schema";
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
 * Saves a draft if it is still at `version` (0: the page has no draft yet) and not locked for
 * publishing. Returns the new version, or null when another save got there first or the draft
 * is locked.
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
    .where(and(eq(cmsDrafts.page, draft.page), eq(cmsDrafts.version, version), isNull(cmsDrafts.lockedAt)))
    .returning({ version: cmsDrafts.version });
  return row?.version ?? null;
}

/** Deletes a draft if it is still at `version` and not locked. Returns whether it did. */
export async function deleteDraft(page: string, version: number): Promise<boolean> {
  const rows = await db
    .delete(cmsDrafts)
    .where(and(eq(cmsDrafts.page, page), eq(cmsDrafts.version, version), isNull(cmsDrafts.lockedAt)))
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

/**
 * Locks a draft for publishing if it is still at `version` and not already locked, so two
 * publishes (or a publish and a save) cannot both go ahead. Returns whether it did.
 */
export async function lockDraft(page: string, version: number): Promise<boolean> {
  const rows = await db
    .update(cmsDrafts)
    .set({ lockedAt: new Date() })
    .where(and(eq(cmsDrafts.page, page), eq(cmsDrafts.version, version), isNull(cmsDrafts.lockedAt)))
    .returning({ page: cmsDrafts.page });
  return rows.length > 0;
}

/** Unlocks a draft; with `lockedAt`, only if it is still that lock. Returns whether it did. */
export async function unlockDraft(page: string, lockedAt?: Date): Promise<boolean> {
  const rows = await db
    .update(cmsDrafts)
    .set({ lockedAt: null })
    .where(and(eq(cmsDrafts.page, page), lockedAt ? eq(cmsDrafts.lockedAt, lockedAt) : undefined))
    .returning({ page: cmsDrafts.page });
  return rows.length > 0;
}

/**
 * Deletes the draft a merged submission sent, once it is live, so the page starts again from
 * the new file. Only that draft: the same version from the same file, locked no later than the
 * submission was made. A draft started afresh or locked by a newer publish is left alone,
 * whatever this caller read before. Returns whether it deleted one.
 */
export async function deleteMergedDraft(page: string, sent: { baseHash: string; draftVersion: number; submittedAt: Date }): Promise<boolean> {
  const rows = await db
    .delete(cmsDrafts)
    .where(
      and(
        eq(cmsDrafts.page, page),
        eq(cmsDrafts.baseHash, sent.baseHash),
        eq(cmsDrafts.version, sent.draftVersion),
        isNotNull(cmsDrafts.lockedAt),
        lte(cmsDrafts.lockedAt, sent.submittedAt),
      ),
    )
    .returning({ page: cmsDrafts.page });
  return rows.length > 0;
}

export type SubmissionRow = typeof cmsSubmissions.$inferSelect;

export async function insertSubmission(row: typeof cmsSubmissions.$inferInsert): Promise<SubmissionRow> {
  const [inserted] = await db.insert(cmsSubmissions).values(row).returning();
  return inserted;
}

/** The page's most recent submission, or null when it was never sent. */
export async function latestSubmission(page: string): Promise<SubmissionRow | null> {
  const [row] = await db
    .select()
    .from(cmsSubmissions)
    .where(eq(cmsSubmissions.page, page))
    .orderBy(desc(cmsSubmissions.submittedAt))
    .limit(1);
  return row ?? null;
}

/** Each page's most recent submission. */
export async function latestSubmissions(): Promise<Map<string, SubmissionRow>> {
  const rows = await db.select().from(cmsSubmissions).orderBy(asc(cmsSubmissions.submittedAt));
  return new Map(rows.map((row) => [row.page, row]));
}

/**
 * Updates a submission if it is still in state `from`, so two page loads reading the same
 * outcome record it once. Returns whether it did.
 */
export async function updateSubmission(
  id: string,
  from: SubmissionRow["state"],
  patch: Partial<Pick<SubmissionRow, "state" | "prNumber" | "branch" | "resolvedAt" | "mergedHash" | "closingNote" | "closingNoteBy">>,
): Promise<boolean> {
  const rows = await db
    .update(cmsSubmissions)
    .set(patch)
    .where(and(eq(cmsSubmissions.id, id), eq(cmsSubmissions.state, from)))
    .returning({ id: cmsSubmissions.id });
  return rows.length > 0;
}
