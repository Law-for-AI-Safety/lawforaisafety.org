import { isProductionDeploy } from "@/lib/deploy-context";
import { sendNewsRadarDigestEmail } from "@/lib/email";
import { finishRun, getNewsRadarSettings, recordFound, runDigest, startRun, type FoundItem } from "@/lib/news-radar-store";
import { digestEmail } from "./digest";
import { normaliseUrl, storyKey, titleKey } from "./normalise";
import { keywordScorer, type Scorer } from "./score";
import { SOURCES } from "./sources";
import type { NewsRadarSettings, SourceAdapter, SourceOutcome } from "./types";

/**
 * One News radar run: ask every source, keep what the scorer finds relevant, store it (see
 * recordFound for "seen before"), record how each source did, and, for the weekly run, email
 * the summary.
 *
 * Each source runs alone with its own time limit, so one being slow, down or throttled costs
 * only its own results: the run goes on with the rest and records the failure, which the admin
 * page shows. The limit keeps the whole run inside the time a Netlify function is given.
 */

/** How far back each run looks: a week, so weekly runs overlap at their edges. */
export const LOOKBACK_DAYS = 7;

/** Time each source has before its requests are abandoned. */
export const SOURCE_BUDGET_MS = 15_000;

export type RunOptions = {
  trigger: "schedule" | "manual";
  triggeredBy?: string | null;
  now?: Date;
  sources?: SourceAdapter[];
  scorer?: Scorer;
  /** Waits between requests; a test passes one that returns at once. */
  sleep?: (ms: number) => Promise<void>;
  budgetMs?: number;
};

export type RunResult = { runId: string; sources: SourceOutcome[]; newCount: number; seenCount: number; email: string | null };

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Why a failure happened, in a line for the admin page. */
function reason(err: unknown, signal: AbortSignal): string {
  if (signal.aborted) return "took too long and was stopped";
  return err instanceof Error ? err.message : String(err);
}

async function askSource(
  source: SourceAdapter,
  settings: NewsRadarSettings,
  now: Date,
  scorer: Scorer,
  sleep: (ms: number) => Promise<void>,
  budgetMs: number,
): Promise<{ outcome: SourceOutcome; found: FoundItem[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  // Waits end early when the source runs out of time, so a throttled source never holds up the run.
  const sleepUntilAborted = (ms: number) =>
    Promise.race([sleep(ms), new Promise<void>((resolve) => controller.signal.addEventListener("abort", () => resolve()))]);
  try {
    const candidates = await source.fetch({ topics: settings.topics, now, days: LOOKBACK_DAYS, signal: controller.signal, sleep: sleepUntilAborted });
    const found = candidates.flatMap((candidate): FoundItem[] => {
      const scored = scorer(candidate, settings.topics, settings.trustedOutlets);
      if (!scored) return [];
      return [
        {
          urlKey: normaliseUrl(candidate.url),
          titleKey: titleKey(clean(candidate.title), clean(candidate.outlet)),
          storyKey: storyKey(clean(candidate.title)),
          url: clean(candidate.url),
          title: clean(candidate.title),
          outlet: clean(candidate.outlet),
          snippet: clean(candidate.snippet),
          kind: candidate.kind,
          publishedAt: candidate.publishedAt,
          sources: [candidate.source],
          topics: scored.topics,
          score: scored.score,
        },
      ];
    });
    return { outcome: { source: source.id, ok: true, found: candidates.length, relevant: found.length }, found };
  } catch (err) {
    console.error(`[news-radar] ${source.label} failed`, err);
    return { outcome: { source: source.id, ok: false, error: reason(err, controller.signal) }, found: [] };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A failure in a line for the admin page. A failed query's message repeats the query and its
 * values; the database's own reason, its `cause`, says what went wrong without them.
 */
export function failureReason(err: unknown): string {
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause : err;
  const message = cause instanceof Error ? cause.message : String(cause);
  return clean(message).slice(0, 300);
}

/** Text without control characters, which Postgres refuses (NUL) or which only garble a title. */
const clean = (text: string) => text.replace(/[\p{Cc}\p{Cf}]+/gu, " ").replace(/\s+/g, " ").trim();

/** Folds sightings of one article (same address, or same title and outlet) into one. */
export function mergeFound(found: FoundItem[]): FoundItem[] {
  const merged: FoundItem[] = [];
  const byUrl = new Map<string, FoundItem>();
  const byTitle = new Map<string, FoundItem>();
  for (const item of found) {
    const same = byUrl.get(item.urlKey) ?? byTitle.get(item.titleKey);
    if (same) {
      same.sources = [...new Set([...same.sources, ...item.sources])];
      same.topics = [...new Set([...same.topics, ...item.topics])];
      same.score = Math.max(same.score, item.score);
      continue;
    }
    const copy = { ...item };
    merged.push(copy);
    byUrl.set(copy.urlKey, copy);
    byTitle.set(copy.titleKey, copy);
  }
  return merged;
}

/** What happened to the weekly email, as the admin page says it. */
async function sendDigest(runId: string, settings: NewsRadarSettings, sources: SourceOutcome[], now: Date): Promise<string> {
  if (!isProductionDeploy()) return "Not sent: only the production site sends the weekly email.";
  if (!settings.recipient) return "Not sent: no recipient is set in the News radar settings.";
  const { fresh, seenBefore } = await runDigest(runId, now);
  const { subject, bodyHtml } = digestEmail({ fresh, seenBefore, topics: settings.topics, failures: sources.filter((s) => !s.ok), now });
  try {
    await sendNewsRadarDigestEmail(settings.recipient, subject, bodyHtml);
    // No address: this line reaches the function logs, which the erasure tool cannot clean.
    return "Sent to the recipient in the News radar settings.";
  } catch (err) {
    console.error("[news-radar] Weekly email failed", err);
    return "Not sent: Brevo refused it. See the function log.";
  }
}

export async function runNewsRadar(options: RunOptions): Promise<RunResult> {
  const now = options.now ?? new Date();
  const settings = await getNewsRadarSettings();
  const runId = await startRun(options.trigger, options.triggeredBy ?? null, now);
  const asked = await Promise.all(
    (options.sources ?? SOURCES).map((source) =>
      askSource(source, settings, now, options.scorer ?? keywordScorer, options.sleep ?? realSleep, options.budgetMs ?? SOURCE_BUDGET_MS),
    ),
  );
  const sources = asked.map((a) => a.outcome);
  try {
    const { added, seenBefore } = await recordFound(runId, now, mergeFound(asked.flatMap((a) => a.found)));
    const email = options.trigger === "schedule" ? await sendDigest(runId, settings, sources, now) : null;
    await finishRun(runId, { sources, newCount: added, seenCount: seenBefore, email });
    return { runId, sources, newCount: added, seenCount: seenBefore, email };
  } catch (err) {
    // Recorded so the admin page says the run failed rather than showing it running for ever.
    await finishRun(runId, { sources, newCount: 0, seenCount: 0, email: null, error: failureReason(err) }).catch((e) =>
      console.error("[news-radar] Could not record the failed run", e),
    );
    throw err;
  }
}
