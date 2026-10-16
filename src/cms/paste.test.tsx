import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorDocToString, richTextToEditorDoc, type PMNode } from "./editor-doc";
import { cmsEditorOptions, cmsExtensions, Wavy, type RichTextKind } from "./editor-extensions";
import { cleanPastedHtml } from "./paste";
import { parseRichText } from "./rich-text";

/**
 * Clipboard HTML goes through ProseMirror's real paste path: `pasteHTML` runs the editor's
 * `transformPastedHTML` (cleanPastedHtml), parses against the editor schema, and inserts.
 * jsdom has no ClipboardEvent, so a plain event stands in for the one the browser passes.
 */
const fixture = (name: string) => readFileSync(`test/fixtures/paste/${name}.html`, "utf8");

const editors: Editor[] = [];
afterEach(() => {
  editors.splice(0).forEach((e) => e.destroy());
  document.body.innerHTML = "";
});

function makeEditor(kind: RichTextKind, value = ""): Editor {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({ ...cmsEditorOptions(kind), element, content: richTextToEditorDoc(parseRichText(value)) });
  editors.push(editor);
  return editor;
}

function paste(kind: RichTextKind, html: string, value = ""): string {
  const editor = makeEditor(kind, value);
  if (value) editor.commands.selectAll();
  editor.view.pasteHTML(html, new Event("paste") as ClipboardEvent);
  return editorDocToString(editor.getJSON() as PMNode);
}

describe("pasting from Word", () => {
  it("keeps only bold, italic, links and bullets, rebuilding Word's lists", () => {
    expect(paste("blocks", fixture("word"))).toBe(
      [
        "Our position on frontier AI",
        "We think **legal professionals** have a role to play. See the *EU AI Act* summary at [this site](https://artificialintelligenceact.eu/) or the [old page](https://insecure.example.org/).",
        "Underlined and big, then spaces after a soft break.",
        "- First **bullet**\n- Second bullet\n- *Third* bullet",
        "**Cell A1**",
        "Cell B1",
        "Caption with **styled bold** and a bookmark.",
      ].join("\n\n"),
    );
  });

  it("joins everything into one paragraph in a single-paragraph field", () => {
    expect(paste("inline", fixture("word"))).toBe(
      "Our position on frontier AI We think **legal professionals** have a role to play. See the *EU AI Act* summary at [this site](https://artificialintelligenceact.eu/) or the [old page](https://insecure.example.org/). Underlined and big, then spaces after a soft break. First **bullet** Second bullet *Third* bullet **Cell A1** Cell B1 Caption with **styled bold** and a bookmark.",
    );
  });
});

describe("pasting from Google Docs", () => {
  it("keeps only bold, italic, links and bullets, flattening nested and numbered lists", () => {
    expect(paste("blocks", fixture("gdocs"))).toBe(
      [
        "Why this matters",
        "Lawyers can help with **binding rules** and *careful drafting*. Read [our plan](https://lawforaisafety.org/field-building) or email [the team](mailto:hello@lawforaisafety.org) (red highlighted strike)",
        "- **Bold** item\n- Nested item\n- Third item\n- Numbered one",
        "**Cell A1**",
        "Cell B1",
        "After image. [redirect link](https://example.org/) and evil link",
      ].join("\n\n"),
    );
  });

  it("joins everything into one paragraph in a single-paragraph field", () => {
    expect(paste("inline", fixture("gdocs"))).toMatch(/^Why this matters Lawyers can help .* Numbered one \*\*Cell A1\*\* Cell B1 After image\. .* evil link$/);
  });
});

describe("pasting into existing text", () => {
  it("replaces the selection", () => {
    expect(paste("blocks", "<p>new <em>text</em></p>", "old **text**")).toBe("new *text*");
  });

  it("keeps a site link and drops a disallowed one", () => {
    expect(paste("inline", '<a href="/field-building">ours</a> <a href="ftp://x.org">theirs</a>')).toBe("[ours](/field-building) theirs");
  });
});

describe("cleanPastedHtml", () => {
  it("joins lists separated only by blank text or line breaks, and lists nested in an item", () => {
    const html = cleanPastedHtml("<ul><li>a<ul><li>b</li></ul></li></ul> <br><ul><li>c</li></ul><p>x</p><ul><li>d</li></ul>");
    // The blank text between the joined lists stays behind; the schema ignores it.
    expect(html).toBe("<ul><li>a</li><li>b</li><li>c</li></ul>  <p>x</p><ul><li>d</li></ul>");
  });

  it("removes scripts, styles, images and comments", () => {
    expect(cleanPastedHtml('<!-- c --><style>p{}</style><script>x()</script><p>t<img src="a"><svg></svg></p>')).toBe("<p>t</p>");
  });

  it("keeps the target of a Google redirect only when it has one", () => {
    expect(cleanPastedHtml('<a href="https://www.google.com/url?sa=D">x</a>')).toBe('<a href="https://www.google.com/url?sa=D">x</a>');
  });
});

describe("the editor set-up", () => {
  it("has bullet lists only in fields that hold more than one paragraph", () => {
    const names = (kind: RichTextKind) => cmsExtensions(kind).map((e) => e.name);
    expect(names("blocks")).toContain("bulletList");
    expect(names("inline")).not.toContain("bulletList");
  });

  it("refuses a second paragraph in a single-paragraph field", () => {
    const editor = makeEditor("inline", "one");
    editor.commands.setTextSelection(4);
    expect(editor.commands.splitBlock()).toBe(false);
  });

  it("toggles the wavy underline by command and by keyboard shortcut", () => {
    const editor = makeEditor("inline", "flair");
    editor.commands.selectAll();
    editor.commands.toggleWavy();
    expect(editorDocToString(editor.getJSON() as PMNode)).toBe("==flair==");
    const shortcut = Wavy.config.addKeyboardShortcuts!.call({ editor } as never) as Record<string, () => boolean>;
    shortcut["Mod-Shift-u"]();
    expect(editorDocToString(editor.getJSON() as PMNode)).toBe("flair");
  });

  it("renders and parses the wavy underline as a marked span", () => {
    const editor = makeEditor("inline", "==w==");
    expect(editor.getHTML()).toBe('<p><span data-wavy="" class="cms-wavy">w</span></p>');
    editor.commands.setContent('<p><span data-wavy="">again</span></p>');
    expect(editorDocToString(editor.getJSON() as PMNode)).toBe("==again==");
  });

  it("allows only links the content format allows", () => {
    const editor = makeEditor("inline", "word");
    editor.commands.selectAll();
    expect(editor.commands.setLink({ href: "javascript:alert(1)" })).toBe(false);
    expect(editor.commands.setLink({ href: "/field-building" })).toBe(true);
    expect(editorDocToString(editor.getJSON() as PMNode)).toBe("[word](/field-building)");
  });
});
