/**
 * Just enough RSS 2.0 reading for the feeds the radar uses (Google News, the Commission's
 * digital-strategy news). No XML library: the feeds are flat, and each field is read from its
 * own element, so an odd item is skipped rather than failing the whole feed.
 */

export type RssItem = {
  title: string;
  link: string;
  pubDate: Date | null;
  description: string;
  /** `<source>` names the outlet in Google News feeds. */
  source: string;
  sourceUrl: string;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

/** Markup removed and whitespace collapsed: what a reader would see. */
export function plainText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function field(item: string, name: string): { text: string; attrs: string } | null {
  const match = item.match(new RegExp(`<${name}(\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  if (!match) return null;
  let text = match[2].trim();
  const cdata = text.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  text = cdata ? cdata[1] : decodeEntities(text);
  return { text, attrs: match[1] ?? "" };
}

export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const [, item] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const title = field(item, "title");
    const link = field(item, "link");
    if (!title || !link) continue;
    const pub = field(item, "pubDate");
    const date = pub ? new Date(pub.text) : null;
    const source = field(item, "source");
    items.push({
      title: plainText(title.text),
      link: link.text.trim(),
      pubDate: date && !Number.isNaN(date.getTime()) ? date : null,
      description: plainText(field(item, "description")?.text ?? ""),
      source: source ? plainText(source.text) : "",
      sourceUrl: decodeEntities(source?.attrs.match(/url="([^"]*)"/)?.[1] ?? ""),
    });
  }
  return items;
}
