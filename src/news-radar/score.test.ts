import { describe, expect, it } from "vitest";
import { isTrustedOutlet, keywordScorer, matchTopics, TRUSTED_OUTLET_BONUS } from "./score";
import type { Candidate, Topic } from "./types";

const topic = (over: Partial<Topic> = {}): Topic => ({ id: "t", name: "T", queries: ["q"], include: ["class action"], require: [], exclude: [], ...over });
const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  url: "https://news.test/a",
  title: "Class action filed over chatbot",
  outlet: "News",
  snippet: "",
  publishedAt: null,
  kind: "news",
  source: "google_news",
  ...over,
});

describe("keywordScorer", () => {
  it("scores a keyword in the title double one in the summary", () => {
    expect(keywordScorer(candidate(), [topic()], [])).toEqual({ topics: ["t"], score: 2 });
    expect(keywordScorer(candidate({ title: "Chatbot news", snippet: "A class action was filed." }), [topic()], [])).toEqual({ topics: ["t"], score: 1 });
  });

  it("matches whole words only", () => {
    expect(keywordScorer(candidate({ title: "Glass actions" }), [topic()], [])).toBeNull();
    expect(keywordScorer(candidate({ title: "Big claims" }), [topic({ include: ["AI"] })], [])).toBeNull();
  });

  it("skips a topic with an exclude keyword, or without a required word", () => {
    expect(keywordScorer(candidate(), [topic({ exclude: ["chatbot"] })], [])).toBeNull();
    expect(keywordScorer(candidate(), [topic({ require: ["algorithm"] })], [])).toBeNull();
    expect(keywordScorer(candidate(), [topic({ require: ["chatbot"] })], [])).toEqual({ topics: ["t"], score: 2 });
  });

  it("lists the topics best first and adds the trusted outlet bonus", () => {
    const topics = [topic({ id: "weak", include: ["filed"] }), topic({ id: "strong", include: ["class action", "chatbot"] })];
    expect(keywordScorer(candidate({ outlet: "Reuters" }), topics, ["Reuters"])).toEqual({ topics: ["strong", "weak"], score: 6 + TRUSTED_OUTLET_BONUS });
  });
});

describe("matchTopics", () => {
  it("says which include keywords each matching topic found, best topic first", () => {
    const topics = [
      topic({ id: "weak", include: ["filed", "court"] }),
      topic({ id: "strong", include: ["class action", "chatbot", "damages"] }),
      topic({ id: "excluded", include: ["chatbot"], exclude: ["filed"] }),
    ];
    expect(matchTopics(candidate({ snippet: "No damages yet." }), topics)).toEqual([
      { id: "strong", keywords: ["class action", "chatbot", "damages"], points: 5 },
      { id: "weak", keywords: ["filed"], points: 2 },
    ]);
  });
});

describe("isTrustedOutlet", () => {
  it("matches a name exactly, or a domain and its subdomains", () => {
    expect(isTrustedOutlet({ outlet: "The Guardian", url: "https://x.test" }, ["the guardian"])).toBe(true);
    expect(isTrustedOutlet({ outlet: "Guardian Weekly", url: "https://x.test" }, ["The Guardian"])).toBe(false);
    expect(isTrustedOutlet({ outlet: "x", url: "https://curia.europa.eu/a" }, ["europa.eu"])).toBe(true);
    expect(isTrustedOutlet({ outlet: "x", url: "https://noteuropa.eu/a" }, ["europa.eu"])).toBe(false);
    expect(isTrustedOutlet({ outlet: "x", url: "https://x.test" }, ["  "])).toBe(false);
  });
});
