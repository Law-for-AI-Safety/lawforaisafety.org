import { cleanTitle, hostOf } from "../normalise";
import type { Candidate, SourceAdapter, Topic } from "../types";
import { failure, getText } from "./http";

export const GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc";

/**
 * GDELT allows one request every 5 seconds from an address and answers a faster one with a
 * plain-text notice (status 200 or 429) instead of JSON. The run makes one request, waits this
 * long and tries once more if it is turned away, so a throttled week costs one source, not the run.
 */
export const GDELT_RETRY_MS = 6_000;

/** Most phrases in one GDELT query; longer queries are refused. */
const MAX_PHRASES = 14;

/**
 * One query covering every topic: their multi-word include keywords as quoted phrases, ORed.
 * Single words are left out, as GDELT refuses short ones and long ones match too much; the
 * scorer decides relevance afterwards, as for every source.
 */
export function gdeltQuery(topics: Topic[]): string | null {
  const phrases = [...new Set(topics.flatMap((t) => t.include).filter((k) => k.trim().includes(" ")).map((k) => k.trim().toLowerCase()))];
  if (phrases.length === 0) return null;
  const terms = phrases.slice(0, MAX_PHRASES).map((p) => `"${p.replace(/"/g, "")}"`);
  return `(${terms.join(" OR ")}) sourcelang:english`;
}

type GdeltArticle = { url?: string; title?: string; domain?: string; seendate?: string };

/** GDELT dates look like 20261126T063000Z. */
function gdeltDate(value: string | undefined): Date | null {
  const m = value?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
}

export const gdelt: SourceAdapter = {
  id: "gdelt",
  label: "GDELT",
  async fetch({ topics, days, signal, sleep }) {
    const query = gdeltQuery(topics);
    if (!query) return [];
    const url = `${GDELT_URL}?${new URLSearchParams({
      query,
      mode: "artlist",
      format: "json",
      maxrecords: "250",
      timespan: `${days}d`,
      sort: "datedesc",
    })}`;
    let answer = await getText(url, signal, "application/json");
    if (!answer.text.trimStart().startsWith("{")) {
      await sleep(GDELT_RETRY_MS);
      answer = await getText(url, signal, "application/json");
    }
    if (answer.status !== 200 || !answer.text.trimStart().startsWith("{")) throw failure("GDELT", answer.status, answer.text);
    const articles = (JSON.parse(answer.text) as { articles?: GdeltArticle[] }).articles ?? [];
    return articles.flatMap((a): Candidate[] => {
      if (!a.url || !a.title) return [];
      const outlet = a.domain || hostOf(a.url);
      return [{ url: a.url, title: cleanTitle(a.title, outlet), outlet, snippet: "", publishedAt: gdeltDate(a.seendate), kind: "news", source: "gdelt" }];
    });
  },
};
