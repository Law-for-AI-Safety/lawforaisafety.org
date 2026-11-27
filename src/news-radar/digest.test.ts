import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./defaults";
import { DIGEST_CAP, digestEmail, safeHref, type DigestItem } from "./digest";

const NOW = new Date("2026-11-30T06:00:00Z");
const item = (n: number, over: Partial<DigestItem> = {}): DigestItem => ({
  title: `Item ${n}`,
  url: `https://news.test/${n}`,
  outlet: "News",
  publishedAt: new Date("2026-11-27T00:00:00Z"),
  topics: ["ai-litigation"],
  score: n,
  ...over,
});
const email = (fresh: DigestItem[], seenBefore = 0) => digestEmail({ fresh, seenBefore, topics: DEFAULT_SETTINGS.topics, failures: [], now: NOW });

describe("digestEmail", () => {
  it(`lists at most ${DIGEST_CAP} items, the highest scoring`, () => {
    const { subject, bodyHtml } = email(Array.from({ length: 25 }, (_, i) => item(i + 1)));
    expect(subject).toBe("News radar: 25 new for the week of 30 Nov 2026");
    expect(bodyHtml).toContain("25 new items this week; the top 20 are below.");
    expect(bodyHtml).toContain("Item 25<");
    expect(bodyHtml).toContain("Item 6<");
    expect(bodyHtml).not.toContain("Item 5<");
  });

  it("groups by topic in the settings' order, putting unknown topics last", () => {
    const { bodyHtml } = email([item(1, { topics: ["gone"] }), item(2, { topics: ["collective-redress"] }), item(3, { topics: ["ai-act-enforcement"] })]);
    const order = ["AI Act enforcement", "Collective redress", "Other"].map((t) => bodyHtml.indexOf(t));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i > 0)).toBe(true);
  });

  it("escapes titles, and never links a non-web address", () => {
    const { bodyHtml } = email([item(1, { title: "<script>x</script>", url: "javascript:alert(1)", publishedAt: null })]);
    expect(bodyHtml).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(bodyHtml).not.toContain("javascript:");
  });

  it("says when nothing is new, and counts in the singular", () => {
    expect(email([], 0).bodyHtml).toContain("Nothing new this week.");
    expect(email([item(1)], 2).bodyHtml).toContain("1 new item this week.");
    expect(email([item(1)], 2).bodyHtml).toContain("2 items seen before were found again and are still relevant.");
  });

  it("only links http and https addresses", () => {
    expect(safeHref("https://a.test")).toBe("https://a.test");
    expect(safeHref("HTTP://a.test")).toBe("HTTP://a.test");
    expect(safeHref("data:text/html,x")).toBeNull();
  });
});
