import {
  cleanHref,
  hrefProblem,
  normalizeRuns,
  parseRichText,
  parseRichTextLoose,
  serializeRichText,
  stripForbiddenText,
  type Run,
} from "../cms/rich-text";

/**
 * News radar items in the subscriber newsletter: each goes in as a bullet holding the item's
 * title, linked, then its outlet and publication date. The body is CMS rich text
 * (src/cms/rich-text.ts). Nothing here imports the radar's sources, so the composer can use it in
 * the browser.
 */

export type RadarEntry = { title: string; outlet: string; url: string; publishedAt: Date | null };

const oneLine = (text: string) => stripForbiddenText(text).replace(/\s+/g, " ").trim();
export const entryDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The link an item goes in under, as the newsletter stores it. */
export const entryHref = (url: string) => cleanHref(url);

/** The bullet's text for one item, or why its link cannot go in the newsletter. */
export function entryRuns(item: RadarEntry): { ok: true; runs: Run[] } | { ok: false; problem: string } {
  const href = entryHref(item.url);
  if (hrefProblem(href)) return { ok: false, problem: "This item's link cannot go in the subscriber newsletter (only https links can)." };
  const title = oneLine(item.title);
  const after = [oneLine(item.outlet), item.publishedAt ? entryDate(item.publishedAt) : ""].filter(Boolean).join(", ");
  return {
    ok: true,
    runs: normalizeRuns([{ text: title || href, marks: { link: href } }, ...(after ? [{ text: ` (${after})`, marks: {} }] : [])]),
  };
}

/**
 * Adds the item's bullet to the end of a body: to the list the body ends with, if it does, so
 * several items build one list. Written back in the canonical form.
 */
export function appendItem(body: string, item: RadarEntry): { ok: true; body: string } | { ok: false; problem: string } {
  const entry = entryRuns(item);
  if (!entry.ok) return entry;
  let doc;
  try {
    doc = body.trim() === "" ? [] : parseRichText(body);
  } catch {
    return { ok: false, problem: "The newsletter has a formatting problem. Fix it in the editor first." };
  }
  const last = doc.at(-1);
  if (last?.type === "bulletList") last.items.push(entry.runs);
  else doc.push({ type: "bulletList", items: [entry.runs] });
  return { ok: true, body: serializeRichText(doc) };
}

/** Every link in a body, so items already in it can be marked. A body that does not read has none. */
export function linkedHrefs(body: string): Set<string> {
  const hrefs = new Set<string>();
  let doc;
  try {
    doc = parseRichTextLoose(body);
  } catch {
    return hrefs;
  }
  for (const block of doc) {
    for (const runs of block.type === "paragraph" ? [block.runs] : block.items) {
      for (const run of runs) if (run.marks.link !== undefined) hrefs.add(run.marks.link);
    }
  }
  return hrefs;
}
