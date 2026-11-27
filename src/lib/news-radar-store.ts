import { and, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsRadarItems, newsRadarRuns, newsRadarSettings } from "@/drizzle/schema";
import { DEFAULT_SETTINGS } from "@/news-radar/defaults";
import type { NewsRadarSettings, SourceId, SourceOutcome } from "@/news-radar/types";

/**
 * Database reads and writes for the News radar. Callers check permissions first; nothing here
 * does.
 */

export type NewsRadarItem = typeof newsRadarItems.$inferSelect;

/** A run's `email` once its summary went out. No address: the line also reaches the function logs. */
export const EMAIL_SENT = "Sent to the recipient in the News radar settings.";
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

/**
 * Replaces the topics and trusted outlets, leaving the recipient as it is, but only if the
 * settings were last saved at `basedOn` (null: never saved), so a change made since the caller
 * read them is not overwritten. Returns false when they have changed since.
 */
export async function saveNewsRadarTuning(
  tuning: Pick<NewsRadarSettings, "topics" | "trustedOutlets">,
  email: string,
  basedOn: Date | null,
): Promise<boolean> {
  const values = { topics: tuning.topics, trustedOutlets: tuning.trustedOutlets, updatedBy: email, updatedAt: new Date() };
  const saved = basedOn
    ? await db
        .update(newsRadarSettings)
        .set(values)
        .where(and(eq(newsRadarSettings.id, 1), eq(newsRadarSettings.updatedAt, basedOn)))
        .returning({ id: newsRadarSettings.id })
    : await db
        .insert(newsRadarSettings)
        .values({ id: 1, ...values })
        .onConflictDoNothing()
        .returning({ id: newsRadarSettings.id });
  return saved.length > 0;
}

export async function startRun(trigger: NewsRadarRun["trigger"], triggeredBy: string | null, now: Date): Promise<string> {
  const [row] = await db.insert(newsRadarRuns).values({ trigger, triggeredBy, startedAt: now }).returning({ id: newsRadarRuns.id });
  return row.id;
}

export async function finishRun(
  id: string,
  result: { sources: SourceOutcome[]; newCount: number; seenCount: number; email: string | null; error?: string | null },
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
 * How recently an item must have been seen for a result with the same title and outlet (but a
 * different address) to count as the same article. Long enough to cover a story resurfacing
 * over several weeks; short enough that a column an outlet runs under the same headline every
 * week or month is not mistaken for last time's.
 */
export const TITLE_MATCH_DAYS = 21;

/**
 * Stores what a run found. An item already known, by address, or by title and outlet within
 * TITLE_MATCH_DAYS, keeps its row, first_seen and triage state, and only gains this run's
 * sightings; anything else is a new row. Runs store their results one at a time (a transaction
 * lock), so two at once cannot both add the same article.
 */
export async function recordFound(runId: string, now: Date, found: FoundItem[]): Promise<{ added: number; seenBefore: number }> {
  if (found.length === 0) return { added: 0, seenBefore: 0 };
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${RECORD_LOCK})`);
    return recordIn(tx, runId, now, found);
  });
}

/** Any fixed number, unique to this lock within the database. */
const RECORD_LOCK = 4_172_026_001;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function recordIn(tx: Tx, runId: string, now: Date, found: FoundItem[]): Promise<{ added: number; seenBefore: number }> {
  const urlKeys = found.map((f) => f.urlKey);
  const titleKeys = found.map((f) => f.titleKey);
  const recent = new Date(now.getTime() - TITLE_MATCH_DAYS * 24 * 60 * 60 * 1000);
  const existing = await tx
    .select()
    .from(newsRadarItems)
    .where(
      or(
        inArray(newsRadarItems.urlKey, urlKeys),
        and(inArray(newsRadarItems.titleKey, titleKeys), gte(newsRadarItems.lastSeenAt, recent)),
      ),
    )
    .orderBy(desc(newsRadarItems.lastSeenAt));
  const byUrl = new Map(existing.map((row) => [row.urlKey, row]));
  const byTitle = new Map<string, NewsRadarItem>();
  for (const row of existing) if (row.lastSeenAt >= recent && !byTitle.has(row.titleKey)) byTitle.set(row.titleKey, row);

  let added = 0;
  const seen = new Set<string>();
  for (const item of found) {
    const known = byUrl.get(item.urlKey) ?? byTitle.get(item.titleKey);
    if (known) {
      if (seen.has(known.id)) continue;
      seen.add(known.id);
      await tx
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
    const inserted = await tx
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

/** Items first seen on or after `since` and before `until`, newest first, for the News radar API. */
export async function itemsBetween(since: Date, until: Date | null, limit: number): Promise<NewsRadarItem[]> {
  return db
    .select()
    .from(newsRadarItems)
    .where(and(gte(newsRadarItems.firstSeenAt, since), until ? lt(newsRadarItems.firstSeenAt, until) : undefined))
    .orderBy(desc(newsRadarItems.firstSeenAt), desc(newsRadarItems.score))
    .limit(limit);
}

/** How far back the newsletter composer's "Insert from News radar" reaches. */
export const PICKER_DAYS = 60;

/**
 * Items the newsletter composer offers: first seen in the last PICKER_DAYS, Useful before New,
 * newest first within each. Dismissed items are left out.
 */
export async function listPickerItems(now: Date, limit = 300): Promise<NewsRadarItem[]> {
  const since = new Date(now.getTime() - PICKER_DAYS * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(newsRadarItems)
    .where(and(ne(newsRadarItems.state, "dismissed"), gte(newsRadarItems.firstSeenAt, since)))
    .orderBy(sql`${newsRadarItems.state} = 'useful' desc`, desc(newsRadarItems.firstSeenAt), desc(newsRadarItems.score))
    .limit(limit);
}

/**
 * Sets the state of item `id`, and of the other outlets' copies of its story (`copyIds`) that were
 * in the same state as it: a copy someone triaged differently on its own keeps its state.
 * Returns false when the item no longer exists.
 */
export async function setItemState(id: string, state: ItemState, email: string, copyIds: string[] = []): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [lead] = await tx.select({ state: newsRadarItems.state }).from(newsRadarItems).where(eq(newsRadarItems.id, id)).for("update");
    if (!lead) return false;
    const change = { state, triagedBy: email, triagedAt: new Date() };
    await tx.update(newsRadarItems).set(change).where(eq(newsRadarItems.id, id));
    if (copyIds.length > 0) {
      await tx
        .update(newsRadarItems)
        .set(change)
        .where(and(inArray(newsRadarItems.id, copyIds), eq(newsRadarItems.state, lead.state)));
    }
    return true;
  });
}

/**
 * When the last weekly run that finished and sent its summary started: this summary covers what
 * was first seen since. A weekly run that failed, or never sent, does not count, so what it found
 * is in the next summary instead of in none.
 */
async function previousScheduledStart(runId: string, startedAt: Date): Promise<Date> {
  const [row] = await db
    .select({ startedAt: newsRadarRuns.startedAt })
    .from(newsRadarRuns)
    .where(
      and(
        eq(newsRadarRuns.trigger, "schedule"),
        ne(newsRadarRuns.id, runId),
        lt(newsRadarRuns.startedAt, startedAt),
        isNotNull(newsRadarRuns.finishedAt),
        isNull(newsRadarRuns.error),
        eq(newsRadarRuns.email, EMAIL_SENT),
      ),
    )
    .orderBy(desc(newsRadarRuns.startedAt))
    .limit(1);
  return row?.startedAt ?? new Date(0);
}

/**
 * The weekly summary's items: everything first seen since the last weekly run, best first
 * (including what a run by hand found in between, which this week's run then saw again), and how
 * many older items this run found again. Dismissed items are left out of both.
 */
export async function runDigest(runId: string, startedAt: Date): Promise<{ fresh: NewsRadarItem[]; seenBefore: number }> {
  const since = await previousScheduledStart(runId, startedAt);
  const fresh = await db
    .select()
    .from(newsRadarItems)
    .where(and(gt(newsRadarItems.firstSeenAt, since), ne(newsRadarItems.state, "dismissed")))
    .orderBy(desc(newsRadarItems.score), desc(newsRadarItems.publishedAt));
  const [again] = await db
    .select({ n: count() })
    .from(newsRadarItems)
    .where(and(eq(newsRadarItems.lastRunId, runId), ne(newsRadarItems.state, "dismissed"), lte(newsRadarItems.firstSeenAt, since)));
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
