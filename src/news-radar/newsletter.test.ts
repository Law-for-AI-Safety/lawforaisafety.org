import { describe, expect, it } from "vitest";
import { parseRichText } from "../cms/rich-text";
import { appendItem, entryRuns, linkedHrefs } from "./newsletter";

const ITEM = { title: "Court [rules] on *AI*", outlet: "Reuters", url: "https://example.com/a (b)", publishedAt: new Date("2026-11-27T23:30:00Z") };

describe("entryRuns", () => {
  it("links the title, then gives the outlet and the day published (in UTC)", () => {
    expect(entryRuns(ITEM)).toEqual({
      ok: true,
      runs: [
        { text: "Court [rules] on *AI*", marks: { link: "https://example.com/a%20%28b%29" } },
        { text: " (Reuters, 27 Nov 2026)", marks: {} },
      ],
    });
  });

  it("leaves out what is missing, and uses the link when there is no title", () => {
    expect(entryRuns({ ...ITEM, outlet: " ", publishedAt: null })).toMatchObject({ runs: [{ text: "Court [rules] on *AI*" }] });
    expect(entryRuns({ ...ITEM, outlet: "", title: "​" })).toMatchObject({ runs: [{ text: "https://example.com/a%20%28b%29" }, { text: " (27 Nov 2026)" }] });
  });

  it("refuses a link the subscriber newsletter cannot hold", () => {
    expect(entryRuns({ ...ITEM, url: "javascript:alert(1)" })).toEqual({ ok: false, problem: expect.stringContaining("only https links") });
  });
});

describe("appendItem", () => {
  it("starts a list in an empty body, with the link percent-encoded and the text escaped", () => {
    const result = appendItem("", ITEM);
    expect(result).toEqual({ ok: true, body: expect.any(String) });
    if (!result.ok) return;
    expect(parseRichText(result.body)).toEqual([
      {
        type: "bulletList",
        items: [[{ text: "Court [rules] on *AI*", marks: { link: "https://example.com/a%20%28b%29" } }, { text: " (Reuters, 27 Nov 2026)", marks: {} }]],
      },
    ]);
  });

  it("adds to the list the body ends with, or starts one after a paragraph", () => {
    const first = appendItem("Intro.", { ...ITEM, title: "One", publishedAt: null });
    expect(first.ok && first.body).toBe("Intro.\n\n- [One](https://example.com/a%20%28b%29) (Reuters)");
    const second = first.ok ? appendItem(first.body, { title: "Two", outlet: "", url: "http://example.org/two", publishedAt: null }) : first;
    expect(second.ok && second.body).toBe("Intro.\n\n- [One](https://example.com/a%20%28b%29) (Reuters)\n- [Two](https://example.org/two)");
  });

  it("refuses a link that cannot go in, and a body that does not parse", () => {
    expect(appendItem("", { ...ITEM, url: "javascript:alert(1)" })).toEqual({ ok: false, problem: expect.stringContaining("only https links") });
    expect(appendItem("**unclosed", ITEM)).toEqual({ ok: false, problem: expect.stringContaining("formatting problem") });
  });
});

describe("linkedHrefs", () => {
  it("collects the links in paragraphs and bullets, and none from a body that does not parse", () => {
    expect(linkedHrefs("See [this](https://a.test/1).\n\n- [That](https://a.test/2) and **bold**")).toEqual(new Set(["https://a.test/1", "https://a.test/2"]));
    expect(linkedHrefs("")).toEqual(new Set());
    expect(linkedHrefs("**unclosed")).toEqual(new Set());
  });
});
