import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { opportunities } from "@/drizzle/schema";
import type { Opportunity } from "./types";

/**
 * Opportunities are plain DB rows - no draft/review state, same trust level as the
 * task-tracker's own CRUD (`src/lib/task-tracker-flow.ts`). Reads go through
 * `src/lib/opportunities-flow.ts` for writes; this module is read-only.
 */

export type OpportunityRow = typeof opportunities.$inferSelect;

export function toOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    title: row.title,
    org: row.org,
    orgUrl: row.orgUrl ?? undefined,
    summary: row.summary,
    description: row.description,
    location: row.location,
    remote: row.remote,
    commitment: row.commitment ?? undefined,
    compensation: row.compensation ?? undefined,
    deadline: row.deadline ?? undefined,
    startDate: row.startDate ?? undefined,
    endDate: row.endDate ?? undefined,
    tags: row.tags && row.tags.length > 0 ? row.tags : undefined,
    applyUrl: row.applyUrl,
    applyLabel: row.applyLabel ?? undefined,
    sourceUrl: row.sourceUrl ?? undefined,
    publishedAt: row.publishedAt,
  };
}

export async function getOpportunities(): Promise<Opportunity[]> {
  const rows = await db.select().from(opportunities).orderBy(desc(opportunities.publishedAt));
  return rows.map(toOpportunity);
}

export async function getOpportunityBySlug(slug: string): Promise<Opportunity | null> {
  const [row] = await db.select().from(opportunities).where(eq(opportunities.slug, slug));
  return row ? toOpportunity(row) : null;
}
