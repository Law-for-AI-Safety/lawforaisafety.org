import { desc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
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
    locationCountry: row.locationCountry,
    locationCity: row.locationCity ?? undefined,
    locationNote: row.locationNote ?? undefined,
    remote: row.remote,
    commitment: row.commitment ?? undefined,
    compMin: row.compMin ?? undefined,
    compMax: row.compMax ?? undefined,
    compCurrency: row.compCurrency ?? undefined,
    compPeriod: row.compPeriod ?? undefined,
    compNote: row.compNote ?? undefined,
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

/** Just slug and publishedAt, for the sitemap - no need to pull every listing's full text to build its URL list. */
export async function getOpportunitySitemapEntries(): Promise<Pick<Opportunity, "slug" | "publishedAt">[]> {
  return db.select({ slug: opportunities.slug, publishedAt: opportunities.publishedAt }).from(opportunities);
}

export async function getOpportunityBySlug(slug: string): Promise<Opportunity | null> {
  const [row] = await db.select().from(opportunities).where(eq(opportunities.slug, slug));
  return row ? toOpportunity(row) : null;
}

/** Tags the public pages' cached reads; `src/lib/opportunities-flow.ts` clears it on every write. */
export const OPPORTUNITIES_CACHE_TAG = "opportunities";
const PUBLIC_CACHE = { tags: [OPPORTUNITIES_CACHE_TAG], revalidate: 3600 };

// The public board and listing pages read through Next's data cache, so a visit needn't wake
// the database. Writes through the flow clear it at once; the hour only bounds how long a
// change made around the flow (a seed, a manual SQL fix) takes to show. Admin pages and the
// API read the uncached functions above.
export const getCachedOpportunities = unstable_cache(getOpportunities, ["opportunities"], PUBLIC_CACHE);
export const getCachedOpportunityBySlug = unstable_cache(getOpportunityBySlug, ["opportunity-by-slug"], PUBLIC_CACHE);

/** Every distinct tag already in use, for the admin form's typeahead - keeps tagging consistent across listings. */
export async function getOpportunityTags(): Promise<string[]> {
  const rows = await db.select({ tags: opportunities.tags }).from(opportunities);
  const tags = new Set<string>();
  for (const row of rows) for (const tag of row.tags ?? []) tags.add(tag);
  return [...tags].sort((a, b) => a.localeCompare(b));
}
