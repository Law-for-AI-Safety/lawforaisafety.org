import { describe, expect, it } from "vitest";
import { parseRichText } from "../cms/rich-text";
import { appendItem } from "./newsletter";

const ITEM = { title: "Court [rules] on *AI*", outlet: "Reuters", url: "https://example.com/a (b)" };

describe("appendItem", () => {
  it("starts a list in an empty draft, with the link percent-encoded and the text escaped", () => {
    const result = appendItem("", ITEM);
    expect(result).toEqual({ ok: true, body: expect.any(String) });
    if (!result.ok) return;
    expect(parseRichText(result.body)).toEqual([
      { type: "bulletList", items: [[{ text: "Court [rules] on *AI*", marks: { link: "https://example.com/a%20%28b%29" } }, { text: " (Reuters)", marks: {} }]] },
    ]);
  });

  it("adds to the list the draft ends with, or starts one after a paragraph", () => {
    const first = appendItem("Intro.", { ...ITEM, title: "One" });
    expect(first.ok && first.body).toBe("Intro.\n\n- [One](https://example.com/a%20%28b%29) (Reuters)");
    const second = first.ok ? appendItem(first.body, { title: "Two", outlet: "", url: "http://example.org/two" }) : first;
    expect(second.ok && second.body).toBe("Intro.\n\n- [One](https://example.com/a%20%28b%29) (Reuters)\n- [Two](https://example.org/two)");
  });

  it("refuses a link a newsletter cannot hold, and a draft that does not parse", () => {
    expect(appendItem("", { ...ITEM, url: "javascript:alert(1)" })).toEqual({ ok: false, problem: expect.stringContaining("only https links") });
    expect(appendItem("**unclosed", ITEM)).toEqual({ ok: false, problem: expect.stringContaining("formatting problem") });
  });
});
