import { isProductionDeploy } from "@/lib/deploy-context";
import { sendNewsRadarDigestEmail } from "@/lib/email";
import { EMAIL_SENT, finishRun, getNewsRadarSettings, recordFound, runDigest, startRun, type FoundItem } from "@/lib/news-radar-store";
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
 * page shows. On Netlify a run happens in a background function (netlify/functions/
 * news-radar-run.mts), started by startNewsRadarRun; the limit keeps it inside that function's
 * 15 minutes, with time left to store the results and send the email.
 */

/** How far back each run looks: a week, so weekly runs overlap at their edges. */
export const LOOKBACK_DAYS = 7;

/** Time a source has before its requests are abandoned, unless it asks for longer (SourceAdapter.budgetMs). */
export const SOURCE_BUDGET_MS = 60_000;

export type RunOptions = {
  trigger: "schedule" | "manual";
  /** The run's row, when startNewsRadarRun made it before handing the run on. */
  runId?: string;
  /** Email the summary at the end, as the weekly run always does. */
  sendDigest?: boolean;
  triggeredBy?: string | null;
  now?: Date;
  sources?: SourceAdapter[];
  scorer?: Scorer;
  /** Waits between requests; a test passes one that returns at once. */
  sleep?: (ms: number) => Promise<void>;
  /** Time every source has, in place of each one's own. */
  budgetMs?: number;
};

export type RunResult = { runId: string; sources: SourceOutcome[]; newCount: number; seenCount: number; email: string | null };

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
let defaultSleep = realSleep;

/**
 * How a run waits between requests when its caller does not say (RunOptions.sleep), as for a
 * run started through startNewsRadarRun. A test passes one that returns at once, and calls this
 * with nothing to go back to real waits.
 */
export function setRunSleep(sleep?: (ms: number) => Promise<void>): void {
  defaultSleep = sleep ?? realSleep;
}

/**
 * Why a source failed, in a line for the admin page: out of time (and, when the source said, what
 * it was waiting on), a service that could not be reached, or the service's own answer.
 */
function reason(err: unknown, signal: AbortSignal, budgetMs: number): string {
  const message = err instanceof Error ? err.message : String(err);
  if (signal.aborted) {
    const limit = budgetMs >= 60_000 ? `${Math.round(budgetMs / 60_000)} min` : budgetMs >= 1000 ? `${Math.round(budgetMs / 1000)}s` : `${budgetMs}ms`;
    const why = err instanceof Error && err.name !== "AbortError" ? `: ${message}` : "";
    return `timed out after ${limit} and was stopped${why}`;
  }
  if (err instanceof TypeError && message === "fetch failed") {
    const cause = err.cause as { code?: string; message?: string } | undefined;
    return `could not be reached${cause?.code ?? cause?.message ? ` (${cause.code ?? cause.message})` : ""}`;
  }
  return message;
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
          urlKey: normaliseUrl(cleanUrl(candidate.url)),
          titleKey: titleKey(clean(candidate.title), clean(candidate.outlet)),
          storyKey: storyKey(clean(candidate.title)),
          url: cleanUrl(candidate.url),
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
    return { outcome: { source: source.id, ok: false, error: reason(err, controller.signal, budgetMs) }, found: [] };
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

/**
 * Text without control characters, which Postgres refuses (NUL), as spaces, and without invisible
 * format characters (soft hyphens, zero-width joiners), which are dropped so the words they sit in
 * stay whole. An address loses both, since it holds no spaces.
 */
const clean = (text: string) => text.replace(/\p{Cf}+/gu, "").replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();
const cleanUrl = (url: string) => url.replace(/[\p{Cc}\p{Cf}\s]+/gu, "");

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
    return EMAIL_SENT;
  } catch (err) {
    console.error("[news-radar] Weekly email failed", err);
    return "Not sent: Brevo refused it. See the function log.";
  }
}

export async function runNewsRadar(options: RunOptions): Promise<RunResult> {
  const now = options.now ?? new Date();
  const runId = options.runId ?? (await startRun(options.trigger, options.triggeredBy ?? null, now));
  let sources: SourceOutcome[] = [];
  const counts = { newCount: 0, seenCount: 0 };
  try {
    const settings = await getNewsRadarSettings();
    const asked = await Promise.all(
      (options.sources ?? SOURCES).map((source) =>
        askSource(source, settings, now, options.scorer ?? keywordScorer, options.sleep ?? defaultSleep, options.budgetMs ?? source.budgetMs ?? SOURCE_BUDGET_MS),
      ),
    );
    sources = asked.map((a) => a.outcome);
    const { added, seenBefore } = await recordFound(runId, now, mergeFound(asked.flatMap((a) => a.found)));
    Object.assign(counts, { newCount: added, seenCount: seenBefore });
    const email = (options.sendDigest ?? options.trigger === "schedule") ? await sendDigest(runId, settings, sources, now) : null;
    await finishRun(runId, { sources, ...counts, email });
    return { runId, sources, ...counts, email };
  } catch (err) {
    // Recorded so the admin page says the run failed rather than showing it running for ever. Its
    // items, if stored, go in the next weekly summary (see runDigest).
    await finishRun(runId, { sources, ...counts, email: null, error: failureReason(err) }).catch((e) =>
      console.error("[news-radar] Could not record the failed run", e),
    );
    throw err;
  }
}
