import { and, eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { opportunities } from "@/drizzle/schema";
import { revalidateTag } from "next/cache";
import { OPPORTUNITIES_CACHE_TAG, toOpportunity, type OpportunityRow } from "@/opportunities/data";
import type { OpportunityFields } from "@/opportunities/form-fields";
import { opportunityFieldsSchema } from "@/opportunities/schema";
import { slugify, uniqueSlug } from "@/opportunities/slug";
import type { Opportunity, OpportunityStatus } from "@/opportunities/types";
import { recordOpportunityAction } from "./opportunities-audit-log";

/**
 * Owns every write to the `opportunities` table, plus validation and audit logging - thin
 * routes call in here, same shape as `src/lib/task-tracker-flow.ts`. A listing is created either
 * published, live at once, or as a draft that stays off the public site until `publishOpportunity`.
 */

export class NotFoundError extends Error {}
export class ValidationError extends Error {}

const MAX_SLUG_ATTEMPTS = 5;

function isUniqueSlugViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: unknown }).code === "23505";
}

/**
 * Drops the public pages' cached reads, so the next visit sees the write rather than a stale
 * copy. Called as soon as the row is written, so nothing after it can leave a saved change
 * hidden behind the cache. A write that only touches a draft leaves the cache be: the public
 * pages never had the draft to begin with.
 */
function clearPublicCache() {
  revalidateTag(OPPORTUNITIES_CACHE_TAG, { expire: 0 });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Slugs that could collide with `base` (itself, or a `-2`/`-3`/... suffix of it) - narrower than every slug in the table. */
async function existingSlugs(base: string): Promise<Set<string>> {
  const rows = await db
    .select({ slug: opportunities.slug })
    .from(opportunities)
    .where(like(opportunities.slug, `${base}%`));
  return new Set(rows.map((row) => row.slug));
}

function parseFields(fields: OpportunityFields): OpportunityFields {
  const parsed = opportunityFieldsSchema.safeParse(fields);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
  return parsed.data;
}

/**
 * Computes a unique slug and inserts, retrying on the rare race where two admins create the same
 * slug at once. A draft takes its slug now, so it keeps the same address once published.
 */
export async function createOpportunity(
  fields: OpportunityFields,
  createdBy: string,
  status: OpportunityStatus = "published",
): Promise<Opportunity> {
  const parsed = parseFields(fields);
  const baseSlug = slugify(`${parsed.org} ${parsed.title}`);

  let row: OpportunityRow | undefined;
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = uniqueSlug(baseSlug, await existingSlugs(baseSlug));
    try {
      [row] = await db
        .insert(opportunities)
        .values({ ...parsed, slug, status, publishedAt: status === "published" ? todayISO() : null, createdBy })
        .returning();
      break;
    } catch (e) {
      if (!isUniqueSlugViolation(e) || attempt === MAX_SLUG_ATTEMPTS - 1) throw e;
    }
  }
  if (!row) throw new Error("Could not find a free slug");
  if (row.status === "published") clearPublicCache();

  await recordOpportunityAction({
    actorEmail: createdBy,
    action: status === "draft" ? "create_draft" : "create",
    entityId: row.id,
    detail: { slug: row.slug, title: row.title, org: row.org },
  });
  return toOpportunity(row);
}

/**
 * The admin form always resends every field, so a missing optional one means "clear it" - but
 * `parsed` carries that as `undefined`, and drizzle's `.set()` silently drops undefined-valued
 * keys from the UPDATE rather than nulling the column. Turn them into explicit `null`s first.
 */
function withNullsForClearedFields(fields: OpportunityFields): typeof fields {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value ?? null])) as typeof fields;
}

/**
 * Edits an existing listing, draft or published. The slug, status and `publishedAt` are never in
 * `fields`, so they never change, except that `publish` also makes a draft public, dated today,
 * in the same UPDATE as the edits, so a failure can't leave one done without the other.
 */
export async function updateOpportunity(
  slug: string,
  fields: OpportunityFields,
  actorEmail: string,
  { publish = false }: { publish?: boolean } = {},
): Promise<Opportunity> {
  const parsed = parseFields(fields);

  const [existing] = await db.select().from(opportunities).where(eq(opportunities.slug, slug));
  if (!existing) throw new NotFoundError();
  const publishing = publish && existing.status === "draft";

  const [row] = await db
    .update(opportunities)
    .set({
      ...withNullsForClearedFields(parsed),
      ...(publishing && { status: "published" as const, publishedAt: todayISO() }),
    })
    .where(eq(opportunities.slug, slug))
    .returning();
  if (!row) throw new NotFoundError();
  if (existing.status === "published" || publishing) clearPublicCache();

  const changedKeys = (Object.keys(parsed) as (keyof OpportunityFields)[]).filter(
    (key) => JSON.stringify(existing[key]) !== JSON.stringify(row[key]),
  );
  const detail = Object.fromEntries(changedKeys.map((key) => [key, { before: existing[key], after: row[key] }]));
  await recordOpportunityAction({ actorEmail, action: "update", entityId: row.id, detail });
  if (publishing) await recordPublish(actorEmail, row);

  return toOpportunity(row);
}

function recordPublish(actorEmail: string, row: OpportunityRow): Promise<void> {
  return recordOpportunityAction({
    actorEmail,
    action: "publish",
    entityId: row.id,
    detail: { slug: row.slug, title: row.title, org: row.org, publishedAt: row.publishedAt },
  });
}

/**
 * Makes a draft public, dated today. Publishing a listing that is already public changes
 * nothing, so a script can safely retry.
 */
export async function publishOpportunity(slug: string, actorEmail: string): Promise<Opportunity> {
  const [row] = await db
    .update(opportunities)
    .set({ status: "published", publishedAt: todayISO() })
    .where(and(eq(opportunities.slug, slug), eq(opportunities.status, "draft")))
    .returning();
  if (!row) {
    const [existing] = await db.select().from(opportunities).where(eq(opportunities.slug, slug));
    if (!existing) throw new NotFoundError();
    return toOpportunity(existing);
  }
  clearPublicCache();
  await recordPublish(actorEmail, row);
  return toOpportunity(row);
}

/** Removes a listing. A snapshot of the row is kept in the audit log, since deleting otherwise loses it entirely. */
export async function deleteOpportunity(slug: string, actorEmail: string): Promise<Opportunity> {
  const [row] = await db.delete(opportunities).where(eq(opportunities.slug, slug)).returning();
  if (!row) throw new NotFoundError();
  if (row.status === "published") clearPublicCache();
  await recordOpportunityAction({ actorEmail, action: "delete", entityId: row.id, detail: row });
  return toOpportunity(row);
}
