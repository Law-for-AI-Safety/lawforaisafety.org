import { describe, expect, it } from "vitest";
import { editorDocToRichText, editorDocToString, richTextToEditorDoc, type PMNode } from "./editor-doc";
import { parseRichText } from "./rich-text";

const text = (t: string, ...marks: PMNode["marks"] & object) => (marks.length ? { type: "text", text: t, marks } : { type: "text", text: t });
const p = (...content: PMNode[]): PMNode => ({ type: "paragraph", content });
const doc = (...content: PMNode[]): PMNode => ({ type: "doc", content });

describe("round trip between content strings and editor documents", () => {
  it.each([
    "Plain text.",
    "**bold** and *italic* and ==wavy==",
    "[a link](/field-building) and [mail](mailto:info@lawforaisafety.org)",
    "[==**all** of *them*==](https://example.org/a)",
    "Para one.\n\n- item **one**\n- item [two](/#contact)\n\nPara two.",
    "Escapes: \\* \\[x\\] \\= \\\\ and #2",
    "\\# not a heading",
    "Café — “quoted” \u{1F600}",
  ])("%j", (value) => {
    const editorDoc = richTextToEditorDoc(parseRichText(value));
    expect(editorDocToString(JSON.parse(JSON.stringify(editorDoc)))).toBe(value);
  });

  it("gives an empty field one empty paragraph, and reads it back as nothing", () => {
    const editorDoc = richTextToEditorDoc([]);
    expect(editorDoc).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(editorDocToString(editorDoc)).toBe("");
  });

  it("writes empty runs as empty paragraphs", () => {
    expect(richTextToEditorDoc([{ type: "paragraph", runs: [] }])).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });
});

describe("normalising editor text", () => {
  it("turns tabs, line breaks and no-break spaces into spaces, collapses runs of spaces and trims lines", () => {
    expect(editorDocToString(doc(p(text("  a  b\tc\nd e   "), text(" f", { type: "bold" }))))).toBe("a b c d e **f**");
  });

  it("removes invisible characters content may not hold", () => {
    expect(editorDocToString(doc(p(text("zero​width soft­hyphen ‮flip heart❤️"))))).toBe(
      "zerowidth softhyphen flip heart❤",
    );
  });

  it("drops empty paragraphs and list items", () => {
    const value = doc(
      p(),
      p(text("   ")),
      { type: "bulletList", content: [{ type: "listItem", content: [p()] }, { type: "listItem", content: [p(text("kept"))] }] },
      { type: "bulletList", content: [{ type: "listItem", content: [p(text(" "))] }] },
      { type: "bulletList" },
    );
    expect(editorDocToString(value)).toBe("- kept");
  });

  it("upgrades http links, encodes what a link may not hold, and unlinks the rest", () => {
    const link = (href: unknown) => ({ type: "link", attrs: { href } });
    const value = doc(
      p(text("a", link("http://example.org/x")), text(" b", link("https://example.org/a b")), text(" c", link("javascript:alert(1)")), text(" d", { type: "link" })),
    );
    expect(editorDocToString(value)).toBe("[a](https://example.org/x) [b](https://example.org/a%20b) c d");
  });

  it("handles text nodes with no text", () => {
    expect(editorDocToString(doc(p({ type: "text" }, text("x"))))).toBe("x");
  });
});

describe("refusing what the editor schema rules out", () => {
  it.each([
    [{ type: "paragraph" }, "Expected a doc node"],
    [doc({ type: "heading" }), "Unexpected block node: heading"],
    [doc(p({ type: "image" })), "Unexpected inline node: image"],
    [doc(p(text("x", { type: "underline" }))), "Unexpected mark: underline"],
    [doc({ type: "bulletList", content: [p()] }), "Unexpected list child: paragraph"],
    [doc({ type: "bulletList", content: [{ type: "listItem", content: [{ type: "bulletList" }] }] }), "Unexpected list item child: bulletList"],
  ])("%#", (value, message) => {
    expect(() => editorDocToRichText(value as PMNode)).toThrow(message);
  });

  it("treats a doc with no content as empty", () => {
    expect(editorDocToRichText({ type: "doc" })).toEqual([]);
    expect(editorDocToRichText(doc({ type: "bulletList", content: [{ type: "listItem" }] }))).toEqual([]);
  });
});
