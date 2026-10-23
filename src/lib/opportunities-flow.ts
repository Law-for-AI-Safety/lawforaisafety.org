import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { opportunities } from "@/drizzle/schema";
import { toOpportunity, type OpportunityRow } from "@/opportunities/data";
import type { OpportunityFields } from "@/opportunities/form-fields";
import { opportunityFieldsSchema } from "@/opportunities/schema";
import { slugify, uniqueSlug } from "@/opportunities/slug";
import type { Opportunity } from "@/opportunities/types";
import { recordOpportunityAction } from "./opportunities-audit-log";

/**
 * Owns every write to the `opportunities` table, plus validation and audit logging - thin
 * routes call in here, same shape as `src/lib/task-tracker-flow.ts`. Every listing publishes
 * immediately on save; there is no draft/review state.
 */

export class NotFoundError extends Error {}
export class ValidationError extends Error {}

const MAX_SLUG_ATTEMPTS = 5;

function isUniqueSlugViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: unknown }).code === "23505";
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function existingSlugs(): Promise<Set<string>> {
  const rows = await db.select({ slug: opportunities.slug }).from(opportunities);
  return new Set(rows.map((row) => row.slug));
}

function parseFields(fields: OpportunityFields): OpportunityFields {
  const parsed = opportunityFieldsSchema.safeParse(fields);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
  return parsed.data;
}

/** Computes a unique slug and inserts, retrying on the rare race where two admins create the same slug at once. */
export async function createOpportunity(fields: OpportunityFields, createdBy: string): Promise<Opportunity> {
  const parsed = parseFields(fields);
  const baseSlug = slugify(`${parsed.org} ${parsed.title}`);

  let row: OpportunityRow | undefined;
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = uniqueSlug(baseSlug, await existingSlugs());
    try {
      [row] = await db
        .insert(opportunities)
        .values({ ...parsed, slug, publishedAt: todayISO(), createdBy })
        .returning();
      break;
    } catch (e) {
      if (!isUniqueSlugViolation(e) || attempt === MAX_SLUG_ATTEMPTS - 1) throw e;
    }
  }
  if (!row) throw new Error("Could not find a free slug");

  await recordOpportunityAction({
    actorEmail: createdBy,
    action: "create",
    entityId: row.id,
    detail: { slug: row.slug, title: row.title, org: row.org },
  });
  return toOpportunity(row);
}

/** Edits an existing listing. The slug and `publishedAt` are never in `fields`, so they never change. */
export async function updateOpportunity(slug: string, fields: OpportunityFields, actorEmail: string): Promise<Opportunity> {
  const parsed = parseFields(fields);

  const [existing] = await db.select().from(opportunities).where(eq(opportunities.slug, slug));
  if (!existing) throw new NotFoundError();

  const [row] = await db.update(opportunities).set(parsed).where(eq(opportunities.slug, slug)).returning();
  if (!row) throw new NotFoundError();

  const changedKeys = (Object.keys(parsed) as (keyof OpportunityFields)[]).filter(
    (key) => JSON.stringify(existing[key]) !== JSON.stringify(row[key]),
  );
  const detail = Object.fromEntries(changedKeys.map((key) => [key, { before: existing[key], after: row[key] }]));
  await recordOpportunityAction({ actorEmail, action: "update", entityId: row.id, detail });

  return toOpportunity(row);
}

/** Removes a listing. A snapshot of the row is kept in the audit log, since deleting otherwise loses it entirely. */
export async function deleteOpportunity(slug: string, actorEmail: string): Promise<Opportunity> {
  const [row] = await db.delete(opportunities).where(eq(opportunities.slug, slug)).returning();
  if (!row) throw new NotFoundError();
  await recordOpportunityAction({ actorEmail, action: "delete", entityId: row.id, detail: row });
  return toOpportunity(row);
}
