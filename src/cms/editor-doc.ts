/**
 * Conversion between typed rich text (`./rich-text`) and the ProseMirror/Tiptap JSON document
 * the toolbar editor works on.
 *
 * Editor schema: doc > (paragraph | bulletList)+, bulletList > listItem+, listItem > paragraph,
 * with the marks bold, italic, wavy and link(href). Single-paragraph fields use a doc that
 * holds one paragraph only (see `./editor-extensions`).
 */
import {
  cleanHref,
  isAllowedHref,
  normalizeRuns,
  serializeRichText,
  stripForbiddenText,
  type Marks,
  type RichText,
  type Run,
} from "./rich-text";

export type PMMark = { type: string; attrs?: Record<string, unknown> };
export type PMNode = {
  type: string;
  text?: string;
  marks?: PMMark[];
  content?: PMNode[];
  attrs?: Record<string, unknown>;
};

function runsToInline(runs: Run[]): PMNode[] {
  return runs.map((r) => {
    const marks: PMMark[] = [];
    if (r.marks.link !== undefined) marks.push({ type: "link", attrs: { href: r.marks.link } });
    if (r.marks.wavy) marks.push({ type: "wavy" });
    if (r.marks.bold) marks.push({ type: "bold" });
    if (r.marks.italic) marks.push({ type: "italic" });
    return marks.length ? { type: "text", text: r.text, marks } : { type: "text", text: r.text };
  });
}

const paragraph = (runs: Run[]): PMNode =>
  runs.length ? { type: "paragraph", content: runsToInline(runs) } : { type: "paragraph" };

export function richTextToEditorDoc(doc: RichText): PMNode {
  const content = doc.map((b) =>
    b.type === "paragraph"
      ? paragraph(b.runs)
      : { type: "bulletList", content: b.items.map((item) => ({ type: "listItem", content: [paragraph(item)] })) },
  );
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/**
 * Editor text is normalised on the way out. Tabs, line breaks and no-break spaces (common in
 * Word paste) become spaces, other characters content may not hold (zero-width spaces, soft
 * hyphens, bidi controls and the like) are removed, runs of spaces collapse, and lines are
 * trimmed. `http:` links become `https:`, and a link that is still not allowed loses its link
 * but keeps its text. Empty paragraphs and list items are dropped because the string format
 * cannot represent them. Anything outside the schema throws, since the editor schema should
 * have made it impossible.
 */
function inlineToRuns(nodes: PMNode[] | undefined): Run[] {
  const runs: Run[] = [];
  for (const n of nodes ?? []) {
    if (n.type !== "text") throw new Error(`Unexpected inline node: ${n.type}`);
    const marks: Marks = {};
    for (const m of n.marks ?? []) {
      if (m.type === "bold" || m.type === "italic" || m.type === "wavy") marks[m.type] = true;
      else if (m.type === "link") {
        const href = cleanHref(String(m.attrs?.href ?? ""));
        if (isAllowedHref(href)) marks.link = href;
      } else throw new Error(`Unexpected mark: ${m.type}`);
    }
    const text = stripForbiddenText((n.text ?? "").replace(/[\t\n\r\u00A0\u2028\u2029]/g, " "));
    runs.push({ text, marks });
  }
  return trimRuns(collapseSpaces(normalizeRuns(runs)));
}

function collapseSpaces(runs: Run[]): Run[] {
  let prevSpace = false;
  return normalizeRuns(
    runs.map((r) => {
      let text = "";
      for (const c of r.text) {
        if (c === " " && prevSpace) continue;
        prevSpace = c === " ";
        text += c;
      }
      return { text, marks: r.marks };
    }),
  );
}

function trimRuns(runs: Run[]): Run[] {
  const out = runs.map((r) => ({ ...r }));
  if (out.length) out[0].text = out[0].text.replace(/^\s+/, "");
  if (out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, "");
  return normalizeRuns(out);
}

export function editorDocToRichText(doc: PMNode): RichText {
  if (doc.type !== "doc") throw new Error("Expected a doc node");
  const out: RichText = [];
  for (const block of doc.content ?? []) {
    if (block.type === "paragraph") {
      const runs = inlineToRuns(block.content);
      if (runs.length) out.push({ type: "paragraph", runs });
    } else if (block.type === "bulletList") {
      const items = (block.content ?? [])
        .map((li) => {
          if (li.type !== "listItem") throw new Error(`Unexpected list child: ${li.type}`);
          return (li.content ?? []).flatMap((p) => {
            if (p.type !== "paragraph") throw new Error(`Unexpected list item child: ${p.type}`);
            return inlineToRuns(p.content);
          });
        })
        .filter((runs) => runs.length > 0);
      if (items.length) out.push({ type: "bulletList", items });
    } else {
      throw new Error(`Unexpected block node: ${block.type}`);
    }
  }
  return out;
}

/** The content-file string for an editor document. */
export function editorDocToString(doc: PMNode): string {
  return serializeRichText(editorDocToRichText(doc));
}
