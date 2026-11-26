import { EU_DIGITAL_URL } from "@/news-radar/sources/eu-digital";
import { GDELT_URL } from "@/news-radar/sources/gdelt";
import { GOOGLE_NEWS_URL } from "@/news-radar/sources/google-news";
import { OPENALEX_URL } from "@/news-radar/sources/openalex";
import type { SourceId } from "@/news-radar/types";
import { route } from "./network";

/**
 * Stands in for the News radar's sources: GDELT, Google News RSS, OpenAlex and the Commission's
 * digital-strategy feed. A test publishes what each would return (`newsSources.googleNews(...)`),
 * can make one fail (`down`) or, for GDELT, turn the next request away as too fast
 * (`throttleGdelt`), and reads back every request made. `test/setup-env.ts` resets it before
 * each test.
 */

export type FakeArticle = { title: string; url: string; outlet: string; date: string; summary?: string };
type Failure = "http" | "network" | "hang";

const xml = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** The notice GDELT sends, as plain text, to a request that comes too soon after another. */
export const GDELT_THROTTLE_NOTICE = "Please limit requests to one every 5 seconds or contact us for larger queries.";

class FakeNewsSources {
  readonly requests: { source: SourceId; url: URL; userAgent: string | null }[] = [];
  private published: Record<SourceId, { article: FakeArticle; when?: string }[]> = { gdelt: [], google_news: [], openalex: [], eu_digital: [] };
  private failures = new Map<SourceId, Failure>();
  private throttled = 0;
  private failingSearches: string[] = [];

  reset(): void {
    this.requests.length = 0;
    this.published = { gdelt: [], google_news: [], openalex: [], eu_digital: [] };
    this.failures.clear();
    this.throttled = 0;
    this.failingSearches = [];
  }

  /** Google News answers 503 to searches whose query contains `text`; the others work. */
  failSearches(text: string): void {
    this.failingSearches.push(text);
  }

  /** Google News returns `article` for searches whose query contains `when` (any search if left out). */
  googleNews(article: FakeArticle, when?: string): void {
    this.published.google_news.push({ article, when });
  }

  gdelt(article: FakeArticle): void {
    this.published.gdelt.push({ article });
  }

  /** A paper, with `summary` as its abstract and `outlet` as its journal. */
  openAlex(article: FakeArticle, when?: string): void {
    this.published.openalex.push({ article, when });
  }

  euDigital(article: FakeArticle): void {
    this.published.eu_digital.push({ article });
  }

  /** Every request to `source` fails: an error status, a refused connection, or no answer at all. */
  down(source: SourceId, how: Failure = "http"): void {
    this.failures.set(source, how);
  }

  /** The next `count` GDELT requests get the plain-text "too fast" notice. */
  throttleGdelt(count = 1): void {
    this.throttled = count;
  }

  to(source: SourceId): URL[] {
    return this.requests.filter((r) => r.source === source).map((r) => r.url);
  }

  private matching(source: SourceId, query: string) {
    return this.published[source].filter((p) => !p.when || query.includes(p.when)).map((p) => p.article);
  }

  async handle(source: SourceId, request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.requests.push({ source, url, userAgent: request.headers.get("user-agent") });
    const failure = this.failures.get(source);
    if (failure === "network") throw new TypeError("fetch failed");
    if (failure === "hang") {
      return new Promise((_, reject) =>
        request.signal.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError"))),
      );
    }
    if (failure === "http") return new Response("Service Unavailable", { status: 503 });
    switch (source) {
      case "gdelt":
        if (this.throttled > 0) {
          this.throttled--;
          return new Response(GDELT_THROTTLE_NOTICE, { status: 429, headers: { "Content-Type": "text/plain" } });
        }
        return Response.json({
          articles: this.published.gdelt.map(({ article: a }) => ({
            url: a.url,
            title: a.title,
            domain: a.outlet,
            seendate: a.date.replace(/[-:]/g, "").replace(/\.\d+/, "").slice(0, 15) + "Z",
          })),
        });
      case "google_news":
        if (this.failingSearches.some((text) => (url.searchParams.get("q") ?? "").includes(text))) {
          return new Response("Service Unavailable", { status: 503 });
        }
        return rss(this.matching(source, url.searchParams.get("q") ?? ""), true);
      case "eu_digital":
        return rss(this.published.eu_digital.map((p) => p.article), false);
      case "openalex":
        return Response.json({
          results: this.matching(source, url.searchParams.get("search") ?? "").map((a, i) => ({
            id: `https://openalex.org/W${i}`,
            doi: a.url,
            display_name: a.title,
            publication_date: a.date.slice(0, 10),
            abstract_inverted_index: a.summary ? Object.fromEntries(a.summary.split(" ").map((w, p) => [w, [p]])) : null,
            primary_location: { landing_page_url: a.url, source: { display_name: a.outlet } },
          })),
        });
    }
  }
}

/** An RSS feed as each source writes it: Google News appends " - Outlet" to titles and names the outlet in <source>. */
function rss(articles: FakeArticle[], google: boolean): Response {
  const items = articles
    .map(
      (a) => `<item><title>${xml(google ? `${a.title} - ${a.outlet}` : a.title)}</title><link>${xml(a.url)}</link><pubDate>${new Date(a.date).toUTCString()}</pubDate>` +
        `<description>${xml(google ? `<a href="${a.url}">${a.title}</a>&nbsp;<font>${a.outlet}</font>` : `<span>${a.title}</span> <time>Mon, 11/23/2026 - 09:00</time> <p>${a.summary ?? ""}</p>`)}</description>` +
        (google ? `<source url="https://${a.outlet.toLowerCase().replace(/\s+/g, "")}.example">${xml(a.outlet)}</source>` : "") +
        `</item>`,
    )
    .join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Feed</title>${items}</channel></rss>`, {
    headers: { "Content-Type": "application/rss+xml" },
  });
}

export const newsSources = new FakeNewsSources();
route(GDELT_URL, (request) => newsSources.handle("gdelt", request));
route(GOOGLE_NEWS_URL, (request) => newsSources.handle("google_news", request));
route(OPENALEX_URL, (request) => newsSources.handle("openalex", request));
route(EU_DIGITAL_URL, (request) => newsSources.handle("eu_digital", request));
