import { parseRss } from "../rss";
import type { SourceAdapter } from "../types";
import { daysAgo, failure, getText, snippet } from "./http";

/**
 * The Commission's "Shaping Europe's digital future" news feed, where the AI Office publishes.
 * It carries all digital policy news, so the scorer does the filtering. (The Court of Justice's
 * press releases have no feed, so CURIA is not a source; its rulings reach the radar through
 * the news sources.)
 */
export const EU_DIGITAL_URL = "https://digital-strategy.ec.europa.eu/en/rss.xml";

/** The description starts with the title, an author line and a date ("Wed, 11/25/2026 - 08:52") before the summary. */
export function summaryOf(description: string, title: string): string {
  const rest = description.startsWith(title) ? description.slice(title.length) : description;
  return rest.replace(/^.*?\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}/, "").trim();
}

export const euDigital: SourceAdapter = {
  id: "eu_digital",
  label: "EU digital strategy news (AI Office)",
  async fetch({ now, days, signal }) {
    const { status, text } = await getText(EU_DIGITAL_URL, signal, "application/rss+xml");
    if (status !== 200) throw failure("The Commission's digital-strategy feed", status, text);
    const since = daysAgo(now, days);
    return parseRss(text)
      .filter((item) => !item.pubDate || item.pubDate >= since)
      .map((item) => ({
        url: item.link,
        title: item.title,
        outlet: "European Commission",
        snippet: snippet(summaryOf(item.description, item.title)),
        publishedAt: item.pubDate,
        kind: "news" as const,
        source: "eu_digital" as const,
      }));
  },
};
