import { and, count, desc, eq, gte, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsRadarItems, newsRadarRuns, newsRadarSettings } from "@/drizzle/schema";
import { DEFAULT_SETTINGS } from "@/news-radar/defaults";
import type { NewsRadarSettings, SourceId, SourceOutcome } from "@/news-radar/types";

/**
 * Database reads and writes for the News radar. Callers check permissions first; nothing here
 * does.
 */

export type NewsRadarItem = typeof newsRadarItems.$inferSelect;
export type NewsRadarRun = typeof newsRadarRuns.$inferSelect;
export type ItemState = NewsRadarItem["state"];

/** A scored candidate, ready to store: what run.ts hands over. */
export type FoundItem = {
  urlKey: string;
  titleKey: string;
  storyKey: string;
  url: string;
  title: string;
  outlet: string;
  snippet: string;
  kind: "news" | "paper";
  publishedAt: Date | null;
  sources: SourceId[];
  topics: string[];
  score: number;
};

export async function getNewsRadarSettings(): Promise<NewsRadarSettings & { updatedBy: string | null; updatedAt: Date | null }> {
  const [row] = await db.select().from(newsRadarSettings).where(eq(newsRadarSettings.id, 1));
  if (!row) return { ...DEFAULT_SETTINGS, updatedBy: null, updatedAt: null };
  return { topics: row.topics, trustedOutlets: row.trustedOutlets, recipient: row.recipient, updatedBy: row.updatedBy, updatedAt: row.updatedAt };
}

export async function saveNewsRadarSettings(settings: NewsRadarSettings, email: string): Promise<void> {
  const values = { topics: settings.topics, trustedOutlets: settings.trustedOutlets, recipient: settings.recipient, updatedBy: email, updatedAt: new Date() };
  await db.insert(newsRadarSettings).values({ id: 1, ...values }).onConflictDoUpdate({ target: newsRadarSettings.id, set: values });
}

export async function startRun(trigger: NewsRadarRun["trigger"], triggeredBy: string | null, now: Date): Promise<string> {
  const [row] = await db.insert(newsRadarRuns).values({ trigger, triggeredBy, startedAt: now }).returning({ id: newsRadarRuns.id });
  return row.id;
}

export async function finishRun(
  id: string,
  result: { sources: SourceOutcome[]; newCount: number; seenCount: number; email: string | null },
): Promise<void> {
  await db
    .update(newsRadarRuns)
    .set({ ...result, finishedAt: new Date() })
    .where(eq(newsRadarRuns.id, id));
}

export async function latestRuns(limit = 5): Promise<NewsRadarRun[]> {
  return db.select().from(newsRadarRuns).orderBy(desc(newsRadarRuns.startedAt)).limit(limit);
}

const merge = <T>(first: T[], second: T[]) => [...new Set([...first, ...second])];

/**
 * Stores what a run found. An item already known, by address or by title and outlet, keeps its
 * row, first_seen and triage state, and only gains this run's sightings; anything else is a new
 * row. Two runs at once cannot make two rows for one article: the keys are unique, and the
 * loser of a race leaves the winner's row.
 */
export async function recordFound(runId: string, now: Date, found: FoundItem[]): Promise<{ added: number; seenBefore: number }> {
  if (found.length === 0) return { added: 0, seenBefore: 0 };
  const urlKeys = found.map((f) => f.urlKey);
  const titleKeys = found.map((f) => f.titleKey);
  const existing = await db
    .select()
    .from(newsRadarItems)
    .where(or(inArray(newsRadarItems.urlKey, urlKeys), inArray(newsRadarItems.titleKey, titleKeys)));
  const byUrl = new Map(existing.map((row) => [row.urlKey, row]));
  const byTitle = new Map(existing.map((row) => [row.titleKey, row]));

  let added = 0;
  const seen = new Set<string>();
  for (const item of found) {
    const known = byUrl.get(item.urlKey) ?? byTitle.get(item.titleKey);
    if (known) {
      if (seen.has(known.id)) continue;
      seen.add(known.id);
      await db
        .update(newsRadarItems)
        .set({
          lastSeenAt: now,
          lastRunId: runId,
          sources: merge(known.sources, item.sources),
          topics: merge(item.topics, known.topics),
          score: Math.max(known.score, item.score),
        })
        .where(eq(newsRadarItems.id, known.id));
      continue;
    }
    const inserted = await db
      .insert(newsRadarItems)
      .values({ ...item, firstSeenAt: now, lastSeenAt: now, firstRunId: runId, lastRunId: runId })
      .onConflictDoNothing()
      .returning({ id: newsRadarItems.id });
    added += inserted.length;
  }
  return { added, seenBefore: seen.size };
}

export type ItemFilter = { topic?: string; source?: SourceId; state?: ItemState };

/** Items for the admin page, newest first. */
export async function listItems(filter: ItemFilter = {}, limit = 500): Promise<NewsRadarItem[]> {
  const conditions = [
    filter.state ? eq(newsRadarItems.state, filter.state) : undefined,
    filter.topic ? sql`${filter.topic} = any(${newsRadarItems.topics})` : undefined,
    filter.source ? sql`${filter.source} = any(${newsRadarItems.sources})` : undefined,
  ].filter((c) => c !== undefined);
  return db
    .select()
    .from(newsRadarItems)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(newsRadarItems.firstSeenAt), desc(newsRadarItems.score))
    .limit(limit);
}

export async function getItem(id: string): Promise<NewsRadarItem | null> {
  const [row] = await db.select().from(newsRadarItems).where(eq(newsRadarItems.id, id));
  return row ?? null;
}

export async function setItemState(id: string, state: ItemState, email: string): Promise<boolean> {
  const rows = await db
    .update(newsRadarItems)
    .set({ state, triagedBy: email, triagedAt: new Date() })
    .where(eq(newsRadarItems.id, id))
    .returning({ id: newsRadarItems.id });
  return rows.length > 0;
}

/** This run's sightings for the weekly summary: new items best first, and how many known ones came back. */
export async function runDigest(runId: string): Promise<{ fresh: NewsRadarItem[]; seenBefore: number }> {
  const fresh = await db
    .select()
    .from(newsRadarItems)
    .where(and(eq(newsRadarItems.firstRunId, runId), ne(newsRadarItems.state, "dismissed")))
    .orderBy(desc(newsRadarItems.score), desc(newsRadarItems.publishedAt));
  const [again] = await db
    .select({ n: count() })
    .from(newsRadarItems)
    .where(
      and(
        eq(newsRadarItems.lastRunId, runId),
        ne(newsRadarItems.state, "dismissed"),
        or(sql`${newsRadarItems.firstRunId} is null`, ne(newsRadarItems.firstRunId, runId)),
      ),
    );
  return { fresh, seenBefore: again.n };
}

/** For the sidebar badge: items first seen in the last week that nobody has looked at yet. */
export async function countUntriaged(): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ n: count() })
    .from(newsRadarItems)
    .where(and(eq(newsRadarItems.state, "new"), gte(newsRadarItems.firstSeenAt, since)));
  return row.n;
}
