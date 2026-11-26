import { hostOf } from "../normalise";
import type { Candidate, SourceAdapter, Topic } from "../types";
import { daysAgo, failure, getText, snippet } from "./http";

export const OPENALEX_URL = "https://api.openalex.org/works";

/** OpenAlex's boolean search: each query in brackets, ORed. */
export function openAlexSearch(topic: Topic): string | null {
  const queries = topic.queries.map((q) => q.trim()).filter(Boolean);
  return queries.length === 0 ? null : queries.map((q) => `(${q})`).join(" OR ");
}

type Work = {
  id?: string;
  doi?: string | null;
  display_name?: string | null;
  publication_date?: string | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  primary_location?: { landing_page_url?: string | null; source?: { display_name?: string | null } | null } | null;
};

/** OpenAlex gives abstracts as word positions; this puts the words back in order. */
export function abstractText(index: Record<string, number[]> | null | undefined): string {
  if (!index) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word;
  return words.filter(Boolean).join(" ");
}

/** Journal articles and preprints published in the window, one search per topic. */
export const openAlex: SourceAdapter = {
  id: "openalex",
  label: "OpenAlex",
  async fetch({ topics, now, days, signal }) {
    const from = daysAgo(now, days).toISOString().slice(0, 10);
    // Journals often date an issue ahead of when it appears; those are not this week's news.
    const to = now.toISOString().slice(0, 10);
    const results: Candidate[] = [];
    for (const topic of topics) {
      const search = openAlexSearch(topic);
      if (!search) continue;
      const url = `${OPENALEX_URL}?${new URLSearchParams({
        search,
        filter: `from_publication_date:${from},to_publication_date:${to}`,
        "per-page": "25",
        select: "id,doi,display_name,publication_date,abstract_inverted_index,primary_location",
      })}`;
      const { status, text } = await getText(url, signal, "application/json");
      if (status !== 200) throw failure("OpenAlex", status, text);
      for (const work of (JSON.parse(text) as { results?: Work[] }).results ?? []) {
        const link = work.doi || work.primary_location?.landing_page_url || work.id;
        if (!link || !work.display_name) continue;
        const venue = work.primary_location?.source?.display_name || hostOf(work.primary_location?.landing_page_url ?? "") || "OpenAlex";
        const date = work.publication_date ? new Date(`${work.publication_date}T00:00:00Z`) : null;
        results.push({
          url: link,
          title: work.display_name.replace(/<[^>]*>/g, "").trim(),
          outlet: venue,
          snippet: snippet(abstractText(work.abstract_inverted_index)),
          publishedAt: date && !Number.isNaN(date.getTime()) ? date : null,
          kind: "paper",
          source: "openalex",
        });
      }
    }
    return results;
  },
};
