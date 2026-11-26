/**
 * The keys that decide whether two results are the same article (see news_radar_items in
 * src/drizzle/schema.ts): the address with tracking removed, and failing that the title and
 * outlet, both normalised so trivial differences in spelling do not make a new item.
 */

/** Query parameters that only track where a click came from, never which page it is. */
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "ocid",
  "cmpid",
  "ref",
  "ref_src",
  "src",
  "oc",
  "smid",
  "sh",
  "guccounter",
  "_ga",
  "_gl",
]);

const isTracking = (name: string) => name.startsWith("utm_") || TRACKING_PARAMS.has(name.toLowerCase());

/**
 * The address an article is known by: https, lower-case host without `www.`, no fragment, no
 * tracking parameters, the rest sorted, and no trailing slash. A Google News link is first
 * turned into the article's own address where it can be (see `resolveGoogleNewsUrl`).
 */
export function normaliseUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(resolveGoogleNewsUrl(input.trim()));
  } catch {
    return input.trim().toLowerCase();
  }
  const params = [...url.searchParams.entries()]
    .filter(([name]) => !isTracking(name))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = params.length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "");
  return `https://${host}${path}${query}`;
}

/**
 * The article's own address for a Google News RSS link, when the link carries it. Older links
 * encode the address inside the article id (base64 of a small protobuf message); newer ones
 * hold only an opaque id that would take a further request to Google to resolve, so they are
 * left as they are and the item is matched on title and outlet instead.
 */
export function resolveGoogleNewsUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return input;
  }
  if (url.hostname !== "news.google.com") return input;
  const match = url.pathname.match(/\/articles\/([A-Za-z0-9_-]+)/);
  if (!match) return input;
  const bytes = Buffer.from(match[1], "base64url").toString("latin1");
  const start = bytes.indexOf("http");
  if (start === -1) return input;
  const embedded = bytes.slice(start).match(/^https?:\/\/[\x21-\x7e]+/);
  if (!embedded) return input;
  try {
    return new URL(embedded[0]).toString();
  } catch {
    return input;
  }
}

/** Lower case, accents and punctuation removed, spaces collapsed. */
export function normaliseText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The article's title without the " - Outlet" a news aggregator adds to the end. */
export function cleanTitle(title: string, outlet: string): string {
  const trimmed = title.replace(/\s+/g, " ").trim();
  for (const separator of [" - ", " | ", " – ", " — "]) {
    const suffix = `${separator}${outlet.trim()}`;
    if (outlet.trim() && trimmed.toLowerCase().endsWith(suffix.toLowerCase())) {
      return trimmed.slice(0, -suffix.length).trim();
    }
  }
  return trimmed;
}

/** The fallback identity: the same title from the same outlet is the same article. */
export function titleKey(title: string, outlet: string): string {
  return `${normaliseText(title)}|${normaliseText(outlet)}`;
}

/** The same story across outlets: the title alone. */
export function storyKey(title: string): string {
  return normaliseText(title);
}

/** The host of `url` without `www.`, for showing an outlet when a source names none. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
