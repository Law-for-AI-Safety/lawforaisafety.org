import { cleanHref, hrefProblem, normalizeRuns, parseRichText, serializeRichText, stripForbiddenText, type Run } from "../cms/rich-text";

/**
 * "Add to newsletter": a bullet holding the item's title, linked, and its outlet, added to the
 * end of a draft's body. Added to the draft's last list when it ends with one, so several items
 * build one list. The body is CMS rich text (src/cms/rich-text.ts), written back in its
 * canonical form.
 */
export function appendItem(
  body: string,
  item: { title: string; outlet: string; url: string },
): { ok: true; body: string } | { ok: false; problem: string } {
  const href = cleanHref(item.url);
  if (hrefProblem(href)) return { ok: false, problem: "This item's link cannot go in a newsletter (only https links can)." };
  let doc;
  try {
    doc = body.trim() === "" ? [] : parseRichText(body);
  } catch {
    return { ok: false, problem: "That draft has a formatting problem. Fix it in the editor first." };
  }
  const title = stripForbiddenText(item.title).replace(/\s+/g, " ").trim();
  const outlet = stripForbiddenText(item.outlet).replace(/\s+/g, " ").trim();
  const runs: Run[] = normalizeRuns([
    { text: title || href, marks: { link: href } },
    ...(outlet ? [{ text: ` (${outlet})`, marks: {} }] : []),
  ]);
  const last = doc.at(-1);
  if (last?.type === "bulletList") last.items.push(runs);
  else doc.push({ type: "bulletList", items: [runs] });
  return { ok: true, body: serializeRichText(doc) };
}
