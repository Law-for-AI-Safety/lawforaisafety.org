import { cleanTitle, hostOf } from "../normalise";
import { parseRss } from "../rss";
import type { Candidate, SourceAdapter, Topic } from "../types";
import { failure, getText } from "./http";

export const GOOGLE_NEWS_URL = "https://news.google.com/rss/search";

/** Pause between the per-topic searches, to stay well clear of Google's limits. */
export const GOOGLE_NEWS_GAP_MS = 750;

/** Google News search syntax: each query in brackets, ORed, limited to the last `days` days. */
export function googleNewsQuery(topic: Topic, days: number): string | null {
  const queries = topic.queries.map((q) => q.trim()).filter(Boolean);
  if (queries.length === 0) return null;
  return `${queries.map((q) => `(${q})`).join(" OR ")} when:${days}d`;
}

/** One search per topic. A topic whose search fails loses only its own results, unless all do. */
export const googleNews: SourceAdapter = {
  id: "google_news",
  label: "Google News",
  async fetch({ topics, days, signal, sleep }) {
    const results: Candidate[] = [];
    const errors: Error[] = [];
    let searched = 0;
    for (const topic of topics) {
      const q = googleNewsQuery(topic, days);
      if (!q) continue;
      if (searched > 0) await sleep(GOOGLE_NEWS_GAP_MS);
      searched++;
      try {
        const url = `${GOOGLE_NEWS_URL}?${new URLSearchParams({ q, hl: "en-GB", gl: "GB", ceid: "GB:en" })}`;
        const { status, text } = await getText(url, signal, "application/rss+xml");
        if (status !== 200) throw failure("Google News", status, text);
        for (const item of parseRss(text)) {
          const outlet = item.source || hostOf(item.sourceUrl) || hostOf(item.link);
          results.push({
            url: item.link,
            title: cleanTitle(item.title, outlet),
            outlet,
            // The description is only the title and outlet again, so it adds nothing to score on.
            snippet: "",
            publishedAt: item.pubDate,
            kind: "news",
            source: "google_news",
          });
        }
      } catch (err) {
        if (signal.aborted) throw err;
        console.error(`[news-radar] Google News search for "${topic.name}" failed`, err);
        errors.push(err as Error);
      }
    }
    if (searched > 0 && errors.length === searched) throw errors[0];
    return results;
  },
};
