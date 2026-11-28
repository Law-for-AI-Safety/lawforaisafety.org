/**
 * The News radar's shared shapes. A source adapter turns one outside service's results into
 * `Candidate`s; a scorer decides which candidates are relevant to which topics; the run
 * (run.ts) stores the relevant ones and records a `SourceOutcome` per source.
 */

/** A topic the radar watches, edited at /admin/news-radar/settings. */
export type Topic = {
  /** Stable id, kept when the topic is renamed, so items keep their topic. */
  id: string;
  name: string;
  /** Search terms sent to the sources. A term with a space is searched as a phrase. */
  queries: string[];
  /** A candidate matches the topic only if its title or summary holds one of these. */
  include: string[];
  /** When not empty, a candidate must also hold one of these (say, a word for AI). */
  require: string[];
  /** A candidate holding any of these never matches the topic. */
  exclude: string[];
};

export type NewsRadarSettings = {
  topics: Topic[];
  /** Outlet names or domains ranked higher (see score.ts). */
  trustedOutlets: string[];
  /** The team group the weekly summary goes to; null until a technical admin sets it. */
  recipient: string | null;
};

export type SourceId = "gdelt" | "google_news" | "openalex" | "eu_digital";

/** One article or paper as a source reported it, before scoring. */
export type Candidate = {
  url: string;
  title: string;
  outlet: string;
  snippet: string;
  publishedAt: Date | null;
  kind: "news" | "paper";
  source: SourceId;
};

/** What a source adapter is given: everything it needs from outside, so tests can stand in. */
export type SourceContext = {
  topics: Topic[];
  now: Date;
  /** How far back to look. */
  days: number;
  /** Aborts every request once the source has used its share of the run's time. */
  signal: AbortSignal;
  /** Waits between requests to a service that limits their rate. */
  sleep: (ms: number) => Promise<void>;
};

export type SourceAdapter = {
  id: SourceId;
  label: string;
  /** Time this source has, when it needs longer than most (see SOURCE_BUDGET_MS in run.ts). */
  budgetMs?: number;
  fetch: (context: SourceContext) => Promise<Candidate[]>;
};

export type SourceOutcome =
  | { source: SourceId; ok: true; found: number; relevant: number }
  | { source: SourceId; ok: false; error: string };
