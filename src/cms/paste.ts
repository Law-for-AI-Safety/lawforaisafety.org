import { cleanHref } from "./rich-text";

/**
 * Pre-cleans clipboard HTML before ProseMirror parses it against the editor
 * schema.
 *
 * The schema already drops anything it has no rule for (colours, fonts,
 * underline, headings become paragraphs, images vanish, links with
 * disallowed schemes lose the link). This pass fixes what the schema alone
 * gets wrong:
 *
 * - Word lists are paragraphs with `mso-list` styles and a literal bullet
 *   glyph, not <ul>/<li>. They are rebuilt as <ul><li> (numbered lists too,
 *   since only bullets are allowed) and the glyph is removed.
 * - <br> has no node in the schema, so the words either side would join.
 *   It becomes a space.
 * - Comments (Word's <!--[if !supportLists]-->), <style>, <meta>, <o:p> and
 *   similar are removed so their text cannot leak in.
 * - Link targets are cleaned as typed ones are (`cleanHref`): `http:` becomes
 *   `https:` and spaces or other characters a target may not hold are
 *   percent-encoded. A target that is still not allowed loses its link when
 *   the schema parses it, and keeps its text.
 *
 * - With `oneParagraph` (fields that hold a single paragraph), every block
 *   (paragraph, heading, list item, table cell) is joined into one paragraph
 *   with spaces between, rather than the schema keeping only the first.
 *
 * Runs in the browser only (ProseMirror calls it from a paste or drop
 * event), so `DOMParser` is available.
 */
/** Elements that start a new block of text. */
const BLOCK_ELEMENTS = "address, article, aside, blockquote, dd, div, dl, dt, figcaption, figure, footer, h1, h2, h3, h4, h5, h6, header, hr, li, main, nav, ol, p, pre, section, table, tbody, td, tfoot, th, thead, tr, ul";

export function cleanPastedHtml(html: string, { oneParagraph = false }: { oneParagraph?: boolean } = {}): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;

  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.parentNode?.removeChild(c));

  body.querySelectorAll("style, script, meta, link, title, xml, img, svg, object, iframe").forEach((el) => el.remove());
  // Namespaced Office tags such as <o:p> parse as elements named "o:p".
  body.querySelectorAll("*").forEach((el) => {
    if (el.tagName.includes(":")) el.replaceWith(...Array.from(el.childNodes));
  });

  // Word list glyphs: <span style="mso-list:Ignore">·<span>&nbsp;…</span></span>
  body.querySelectorAll("span").forEach((el) => {
    if (/mso-list:\s*ignore/i.test(el.getAttribute("style") ?? "")) el.remove();
  });

  // Word list paragraphs -> <ul><li>
  const isWordListItem = (el: Element | null): el is HTMLElement =>
    !!el &&
    el.tagName === "P" &&
    (/^MsoListParagraph/i.test(el.className) || /mso-list:\s*l\d/i.test(el.getAttribute("style") ?? ""));
  body.querySelectorAll("p").forEach((p) => {
    // The first item of a run takes the whole run with it, so later items are no longer connected.
    if (!isWordListItem(p) || !p.isConnected) return;
    const ul = doc.createElement("ul");
    p.before(ul);
    let cur: Element | null = p;
    while (isWordListItem(cur)) {
      const next: Element | null = cur.nextElementSibling;
      const li = doc.createElement("li");
      const para = doc.createElement("p");
      para.append(...Array.from(cur.childNodes));
      li.append(para);
      ul.append(li);
      cur.remove();
      cur = next;
    }
  });

  // Only flat bullet lists exist. Numbered lists become bullets, and nested
  // lists (Google Docs puts <ul> directly inside <ul>; others nest inside
  // <li>) are flattened into their parent list so they don't split it.
  body.querySelectorAll("ol").forEach((ol) => {
    const ul = doc.createElement("ul");
    ul.append(...Array.from(ol.childNodes));
    ol.replaceWith(ul);
  });
  let nested: Element | null;
  while ((nested = body.querySelector("ul ul"))) {
    const host = nested.parentElement!;
    if (host.tagName === "LI") host.after(...Array.from(nested.childNodes));
    else nested.replaceWith(...Array.from(nested.childNodes));
    nested.remove();
  }
  // Lists separated only by whitespace or <br> become one list.
  body.querySelectorAll("ul").forEach((ul) => {
    if (!ul.isConnected) return;
    for (;;) {
      let next = ul.nextSibling;
      while (next && ((next.nodeType === Node.TEXT_NODE && next.textContent!.trim() === "") || next.nodeName === "BR")) {
        next = next.nextSibling;
      }
      if (next?.nodeName !== "UL") break;
      ul.append(...Array.from(next.childNodes));
      (next as Element).remove();
    }
  });

  // Google Docs sometimes wraps links in a redirect; keep the real target.
  body.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href")!;
    const m = /^https:\/\/www\.google\.com\/url\?(.*)$/.exec(href);
    const q = m && new URLSearchParams(m[1]).get("q");
    a.setAttribute("href", cleanHref(q || href));
  });

  body.querySelectorAll("br").forEach((br) => br.replaceWith(doc.createTextNode(" ")));

  if (oneParagraph) {
    body.querySelectorAll(BLOCK_ELEMENTS).forEach((el) => el.replaceWith(" ", ...Array.from(el.childNodes), " "));
    return `<p>${body.innerHTML}</p>`;
  }
  return body.innerHTML;
}
