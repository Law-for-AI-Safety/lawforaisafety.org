import { cleanTitle, hostOf } from "../normalise";
import type { Candidate, SourceAdapter, Topic } from "../types";
import { failure, getText } from "./http";

/**
 * Plain HTTP, as in GDELT's own documentation: its TLS handshake often outlasts the time Node's
 * fetch allows for connecting, so over HTTPS requests fail before GDELT has answered. Nothing
 * private is sent, and what comes back is listings of public news, which a person reads before
 * any of it is used; the scorer and safeHref (digest.ts) keep out anything but web links.
 */
export const GDELT_URL = "http://api.gdeltproject.org/api/v2/doc/doc";

/**
 * GDELT allows one request every 5 seconds from an address, and often turns away even slower
 * ones for minutes at a time when it is busy, answering with a plain-text notice (status 200 or
 * 429) instead of JSON. Requests are spaced by this much at least.
 */
export const GDELT_GAP_MS = 6_000;

/**
 * How long to wait before asking again after each turned-away or failed request, in turn; the
 * last wait repeats until the source runs out of time.
 */
export const GDELT_RETRY_MS = [10_000, 20_000, 40_000, 60_000];

/** Most attempts at one query when GDELT cannot be reached at all, as it then rarely recovers within a run. */
export const GDELT_CONNECT_TRIES = 3;

/** Most phrases in all GDELT queries together, so a run makes only a few requests. */
const MAX_PHRASES = 14;

/**
 * Longest GDELT query, in characters, with a margin below the length at which GDELT refuses a
 * query as "too short or too long".
 */
export const QUERY_MAX_CHARS = 220;

const LANGUAGE = " sourcelang:english";
const query = (phrases: string[]) => `(${phrases.map((p) => `"${p}"`).join(" OR ")})${LANGUAGE}`;

/**
 * Queries covering every topic: their multi-word include keywords as quoted phrases, ORed,
 * taken in turn from each topic (its first, then each one's second, and so on) so every topic
 * is searched when they cannot all fit, and split into as few queries as GDELT will take. Single
 * words are left out, as GDELT refuses short ones and long ones match too much; the scorer
 * decides relevance afterwards, as for every source.
 */
export function gdeltQueries(topics: Topic[]): string[] {
  const perTopic = topics.map((t) => t.include.map((k) => k.trim().toLowerCase().replace(/"/g, "")).filter((k) => k.includes(" ")));
  const phrases = new Set<string>();
  for (let i = 0; phrases.size < MAX_PHRASES && perTopic.some((list) => i < list.length); i++) {
    for (const list of perTopic) if (i < list.length && phrases.size < MAX_PHRASES) phrases.add(list[i]);
  }
  const groups: string[][] = [];
  for (const phrase of phrases) {
    const last = groups.at(-1);
    if (last && query([...last, phrase]).length <= QUERY_MAX_CHARS) last.push(phrase);
    else groups.push([phrase]);
  }
  return groups.map(query);
}

type GdeltArticle = { url?: string; title?: string; domain?: string; seendate?: string };

/** GDELT dates look like 20261126T063000Z. */
function gdeltDate(value: string | undefined): Date | null {
  const m = value?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
}

const isJson = (text: string) => text.trimStart().startsWith("{");
const isThrottled = (answer: { status: number; text: string }) => answer.status === 429 || (!isJson(answer.text) && /please limit requests/i.test(answer.text));

/**
 * One query, asked again after each "too fast" notice until GDELT answers or the source runs out
 * of time, and after a failed connection a few times. Once out of time, the error says what GDELT
 * was last doing.
 */
async function ask(url: string, signal: AbortSignal, sleep: (ms: number) => Promise<void>): Promise<GdeltArticle[]> {
  let tries = 0;
  let unreachable = 0;
  let problem = "";
  const outOfTime = (cause: unknown) => (problem ? new Error(`GDELT ${problem} after ${tries} ${tries === 1 ? "try" : "tries"}`, { cause }) : cause);
  for (;;) {
    if (signal.aborted) throw outOfTime(signal.reason);
    let answer: { status: number; text: string } | null = null;
    try {
      answer = await getText(url, signal, "application/json");
    } catch (err) {
      if (signal.aborted) throw outOfTime(err);
      if (++unreachable >= GDELT_CONNECT_TRIES) throw err;
      problem = "could not be reached";
    }
    if (answer && !isThrottled(answer)) {
      if (answer.status !== 200) throw failure("GDELT", answer.status, answer.text);
      if (!isJson(answer.text)) throw new Error(`GDELT refused the query: ${answer.text.replace(/\s+/g, " ").trim().slice(0, 160)}`);
      return (JSON.parse(answer.text) as { articles?: GdeltArticle[] }).articles ?? [];
    }
    if (answer) problem = "was still turning requests away as too fast (429)";
    await sleep(GDELT_RETRY_MS[Math.min(tries, GDELT_RETRY_MS.length - 1)]);
    tries++;
  }
}

/**
 * Time GDELT has: most of the background function's 15 minutes, as on a busy day it turns
 * requests away for minutes at a time.
 */
export const GDELT_BUDGET_MS = 10 * 60_000;

/**
 * A few queries, asked one after another. A query that fails loses only its own results, unless
 * all do; running out of time keeps what the queries before it found.
 */
export const gdelt: SourceAdapter = {
  id: "gdelt",
  label: "GDELT",
  budgetMs: GDELT_BUDGET_MS,
  async fetch({ topics, days, signal, sleep }) {
    const results: Candidate[] = [];
    const errors: Error[] = [];
    let answered = 0;
    const queries = gdeltQueries(topics);
    for (const [i, query] of queries.entries()) {
      if (i > 0) await sleep(GDELT_GAP_MS);
      if (signal.aborted && answered > 0) break;
      const url = `${GDELT_URL}?${new URLSearchParams({ query, mode: "artlist", format: "json", maxrecords: "250", timespan: `${days}d`, sort: "datedesc" })}`;
      try {
        for (const a of await ask(url, signal, sleep)) {
          if (!a.url || !a.title) continue;
          const outlet = a.domain || hostOf(a.url);
          results.push({ url: a.url, title: cleanTitle(a.title, outlet), outlet, snippet: "", publishedAt: gdeltDate(a.seendate), kind: "news", source: "gdelt" });
        }
        answered++;
      } catch (err) {
        if (signal.aborted && answered > 0) {
          console.error(`[news-radar] GDELT ran out of time at query ${i + 1} of ${queries.length}; keeping what the others found`, err);
          break;
        }
        if (signal.aborted) throw err;
        console.error(`[news-radar] GDELT query ${i + 1} of ${queries.length} failed`, err);
        errors.push(err as Error);
      }
    }
    if (queries.length > 0 && errors.length === queries.length) throw errors[0];
    return results;
  },
};
