import { keywordScorer, matchTopics, type Scorer } from "./score";
import type { Candidate, NewsRadarSettings } from "./types";

/**
 * What the News radar API (/api/admin/news-radar) hands an agent tuning the radar: stored items with
 * why they matched, and how they would fare under proposed settings. Pure, so the same scorer the
 * weekly run uses judges proposed settings, and nothing here can save them.
 */

/** The settings an agent may read and change: never the recipient, which only a technical admin sets. */
export type Tuning = Pick<NewsRadarSettings, "topics" | "trustedOutlets">;

/** A stored item, as much of it as tuning needs. */
export type StoredItem = {
  id: string;
  url: string;
  title: string;
  outlet: string;
  snippet: string;
  kind: "news" | "paper";
  publishedAt: Date | null;
  firstSeenAt: Date;
  sources: string[];
  topics: string[];
  score: number;
  state: "new" | "useful" | "dismissed";
  triagedAt: Date | null;
};

/** A topic an item matches, with the include keywords found in it. */
export type Matched = { topic: string; keywords: string[] };

/**
 * One item for export. `topics` and `score` are as stored when it was found; `matched` is worked
 * out against `settings`. Who triaged it is left out: it names a member of the team.
 */
export function exportItem(item: StoredItem, settings: Tuning) {
  return {
    id: item.id,
    title: item.title,
    outlet: item.outlet,
    url: item.url,
    snippet: item.snippet,
    kind: item.kind,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    firstSeenAt: item.firstSeenAt.toISOString(),
    sources: item.sources,
    state: item.state,
    triagedAt: item.triagedAt?.toISOString() ?? null,
    topics: item.topics,
    score: item.score,
    matched: matchedKeywords(item, settings),
  };
}

export function matchedKeywords(item: Pick<StoredItem, "title" | "snippet">, settings: Tuning): Matched[] {
  return matchTopics(item, settings.topics).map((m) => ({ topic: m.id, keywords: m.keywords }));
}

const asCandidate = (item: StoredItem): Candidate => ({
  url: item.url,
  title: item.title,
  outlet: item.outlet,
  snippet: item.snippet,
  publishedAt: item.publishedAt,
  kind: item.kind,
  source: "google_news",
});

type Verdict = { kept: boolean; score: number | null; topics: string[] };

function judge(item: StoredItem, settings: Tuning, scorer: Scorer): Verdict {
  const scored = scorer(asCandidate(item), settings.topics, settings.trustedOutlets);
  return scored ? { kept: true, score: scored.score, topics: scored.topics } : { kept: false, score: null, topics: [] };
}

type Tally = { total: number; keptNow: number; keptProposed: number };

/**
 * How each stored item scores under the settings in force and under `proposed`, and a tally per
 * triage state: a good change keeps the Useful items and drops the Dismissed ones. Only items the
 * radar already stored can be judged: what new search terms would find is not known until a run.
 */
export function rescore(items: StoredItem[], current: Tuning, proposed: Tuning, scorer: Scorer = keywordScorer) {
  const summary: Record<StoredItem["state"], Tally> = {
    useful: { total: 0, keptNow: 0, keptProposed: 0 },
    dismissed: { total: 0, keptNow: 0, keptProposed: 0 },
    new: { total: 0, keptNow: 0, keptProposed: 0 },
  };
  const results = items.map((item) => {
    const now = judge(item, current, scorer);
    const next = judge(item, proposed, scorer);
    const tally = summary[item.state];
    tally.total++;
    if (now.kept) tally.keptNow++;
    if (next.kept) tally.keptProposed++;
    return {
      id: item.id,
      title: item.title,
      outlet: item.outlet,
      state: item.state,
      change: now.kept === next.kept ? (now.kept ? "still kept" : "still dropped") : next.kept ? "newly kept" : "newly dropped",
      now,
      proposed: { ...next, matched: matchedKeywords(item, proposed) },
    };
  });
  return { summary, items: results };
}
