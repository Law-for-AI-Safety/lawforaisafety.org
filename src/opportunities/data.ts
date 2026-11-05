import { count, desc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { opportunities } from "@/drizzle/schema";
import { isPublished, type Opportunity, type PublishedOpportunity } from "./types";

/**
 * Opportunities are plain DB rows, same trust level as the task-tracker's own CRUD
 * (`src/lib/task-tracker-flow.ts`). Writes go through `src/lib/opportunities-flow.ts`; this
 * module is read-only. The admin reads see drafts too; the public reads (the cached ones) see
 * only published listings.
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
    rounds: row.rounds && row.rounds.length > 0 ? row.rounds : undefined,
    tags: row.tags && row.tags.length > 0 ? row.tags : undefined,
    applyUrl: row.applyUrl,
    applyLabel: row.applyLabel ?? undefined,
    sourceUrl: row.sourceUrl ?? undefined,
    status: row.status,
    publishedAt: row.publishedAt ?? undefined,
  };
}

/** Every listing, drafts included, for the admin and the API. */
export async function getOpportunities(): Promise<Opportunity[]> {
  const rows = await db.select().from(opportunities).orderBy(desc(opportunities.publishedAt), desc(opportunities.createdAt));
  return rows.map(toOpportunity);
}

/** Only what the public may see. Every public read goes through this, so a draft can't leak. */
export async function getPublishedOpportunities(): Promise<PublishedOpportunity[]> {
  const rows = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.status, "published"))
    .orderBy(desc(opportunities.publishedAt));
  return rows.map(toOpportunity).filter(isPublished);
}

/** For the admin header's Drafts link. */
export async function countDraftOpportunities(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(opportunities).where(eq(opportunities.status, "draft"));
  return row.n;
}

/** For linking a published submission to the listing made from it. */
export async function getOpportunitySlugById(id: string): Promise<string | null> {
  const [row] = await db.select({ slug: opportunities.slug }).from(opportunities).where(eq(opportunities.id, id));
  return row?.slug ?? null;
}

export async function getOpportunityBySlug(slug: string): Promise<Opportunity | null> {
  const [row] = await db.select().from(opportunities).where(eq(opportunities.slug, slug));
  return row ? toOpportunity(row) : null;
}

/** Tags the public pages' cached reads; `src/lib/opportunities-flow.ts` clears it on every write. */
export const OPPORTUNITIES_CACHE_TAG = "opportunities";
const PUBLIC_CACHE = { tags: [OPPORTUNITIES_CACHE_TAG], revalidate: 3600 };

// The public board and listing pages read through Next's data cache, so a visit needn't wake
// the database. Writes through the flow clear it at once. A change made around the flow (a
// seed, a manual SQL fix) waits for the hour to pass, and then one more visit: the first
// request after that is still served the cached list while it refreshes in the background.
// Admin pages and the API read the uncached functions above; the sitemap shares the cached list.
// On Netlify the data cache is kept per deploy, so each deploy starts with it empty.
export const getCachedOpportunities = unstable_cache(getPublishedOpportunities, ["opportunities"], PUBLIC_CACHE);

/**
 * Picked out of the cached list rather than cached per slug, so one entry serves every listing
 * page and a request for a made-up slug adds nothing to the cache.
 */
export async function getCachedOpportunityBySlug(slug: string): Promise<PublishedOpportunity | null> {
  return (await getCachedOpportunities()).find((opportunity) => opportunity.slug === slug) ?? null;
}

/** Every distinct tag already in use, for the admin form's typeahead - keeps tagging consistent across listings. */
export async function getOpportunityTags(): Promise<string[]> {
  const rows = await db.select({ tags: opportunities.tags }).from(opportunities);
  const tags = new Set<string>();
  for (const row of rows) for (const tag of row.tags ?? []) tags.add(tag);
  return [...tags].sort((a, b) => a.localeCompare(b));
}
