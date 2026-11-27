import { describe, expect, it } from "vitest";
import { exportItem, rescore, type StoredItem, type Tuning } from "./tuning";
import type { Topic } from "./types";

const topic = (over: Partial<Topic> = {}): Topic => ({ id: "t", name: "T", queries: ["q"], include: ["class action"], require: [], exclude: [], ...over });
const item = (over: Partial<StoredItem> = {}): StoredItem => ({
  id: "1",
  url: "https://news.test/1",
  title: "Class action filed over chatbot",
  outlet: "News",
  snippet: "",
  kind: "news",
  publishedAt: new Date("2026-11-20T00:00:00Z"),
  firstSeenAt: new Date("2026-11-23T06:00:00Z"),
  sources: ["google_news"],
  topics: ["t"],
  score: 2,
  state: "new",
  triagedAt: null,
  ...over,
});
const settings = (topics: Topic[], trustedOutlets: string[] = []): Tuning => ({ topics, trustedOutlets });

describe("exportItem", () => {
  it("gives the item, its triage state and the keywords it matches, but not who triaged it", () => {
    const stored = { ...item({ state: "useful", triagedAt: new Date("2026-11-24T09:00:00Z") }), triagedBy: "someone@example.com" };
    const exported = exportItem(stored, settings([topic(), topic({ id: "other", include: ["merger"] })]));
    expect(exported).toEqual({
      id: "1",
      title: "Class action filed over chatbot",
      outlet: "News",
      url: "https://news.test/1",
      snippet: "",
      kind: "news",
      publishedAt: "2026-11-20T00:00:00.000Z",
      firstSeenAt: "2026-11-23T06:00:00.000Z",
      sources: ["google_news"],
      state: "useful",
      triagedAt: "2026-11-24T09:00:00.000Z",
      topics: ["t"],
      score: 2,
      matched: [{ topic: "t", keywords: ["class action"] }],
    });
    expect(JSON.stringify(exported)).not.toContain("someone@example.com");
    expect(exportItem(item({ publishedAt: null }), settings([])).publishedAt).toBeNull();
  });
});

describe("rescore", () => {
  it("says how each item fares now and under the proposed settings, tallied by triage state", () => {
    const items = [
      item({ id: "useful", state: "useful", title: "Class action over chatbot harms" }),
      item({ id: "dismissed", state: "dismissed", title: "Class action over webinar fees" }),
      item({ id: "new", state: "new", title: "Chatbot lawsuit filed" }),
      item({ id: "never", state: "new", title: "Weather" }),
    ];
    const current = settings([topic()]);
    const proposed = settings([topic({ include: ["class action", "lawsuit"], exclude: ["webinar"] })], ["News"]);
    const result = rescore(items, current, proposed);

    expect(result.summary).toEqual({
      useful: { total: 1, keptNow: 1, keptProposed: 1 },
      dismissed: { total: 1, keptNow: 1, keptProposed: 0 },
      new: { total: 2, keptNow: 0, keptProposed: 1 },
    });
    expect(result.items.map((r) => [r.id, r.change])).toEqual([
      ["useful", "still kept"],
      ["dismissed", "newly dropped"],
      ["new", "newly kept"],
      ["never", "still dropped"],
    ]);
    expect(result.items[0]).toMatchObject({
      now: { kept: true, score: 2, topics: ["t"] },
      proposed: { kept: true, score: 5, topics: ["t"], matched: [{ topic: "t", keywords: ["class action"] }] },
    });
    expect(result.items[1].proposed).toEqual({ kept: false, score: null, topics: [], matched: [] });
  });
});
