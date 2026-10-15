import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { hrefProblem } from "./rich-text";
import { isSiteRoute, type Route } from "./routes";
import { SLUG } from "./slugs";

/**
 * Redirects from old page addresses, kept in `content/_redirects.json` so a changed or removed
 * page can keep its old links working. `next.config.ts` serves each one as a permanent (308)
 * redirect. Files in `content/` whose names start with `_` hold site settings, not pages.
 *
 * Each redirect goes from a single-segment site path that is not a page and not reserved, to a
 * real page of this site or an `https:` address. Since a target must be a real page and a
 * source must not be one, a redirect can never lead to another redirect, so there are no
 * chains or loops; they are still reported by name, for a clearer message.
 */

export const REDIRECTS_FILE = "_redirects.json";

export type Redirect = { from: string; to: string };

export const redirectsSchema = z.strictObject({
  redirects: z.array(z.strictObject({ from: z.string(), to: z.string() })).max(500, "At most 500 redirects"),
});

export class RedirectsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedirectsError";
  }
}

/** The redirects in a file's text. Throws a RedirectsError when it is not JSON of the right shape. */
export function parseRedirects(text: string): Redirect[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw new RedirectsError(`content/${REDIRECTS_FILE} is not valid JSON: ${(e as Error).message}`);
  }
  const result = redirectsSchema.safeParse(value);
  if (!result.success) throw new RedirectsError(`content/${REDIRECTS_FILE} is invalid:\n${z.prettifyError(result.error)}`);
  return result.data.redirects;
}

/** The redirects file's text, or null when there is none. */
export function readRedirectsText(contentDir: string): string | null {
  const file = path.join(contentDir, REDIRECTS_FILE);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

/** The content directory's redirects; none when there is no file. */
export function readRedirects(contentDir: string): Redirect[] {
  const text = readRedirectsText(contentDir);
  return text === null ? [] : parseRedirects(text);
}

/** The one canonical text of a list of redirects. */
export function printRedirects(redirects: Redirect[]): string {
  return `${JSON.stringify({ redirects: redirects.map(({ from, to }) => ({ from, to })) }, null, 2)}\n`;
}

export type RedirectContext = {
  /** Slugs no page or redirect may take (see `reservedSlugs`). */
  reserved: Set<string>;
  /** Every real page and file of the site, content pages included. */
  routes: Route[];
};

/** One message per broken rule. None means the redirects may be served. */
export function redirectProblems(redirects: Redirect[], { reserved, routes }: RedirectContext): string[] {
  const problems: string[] = [];
  const sources = new Set(redirects.map((r) => r.from));
  const seen = new Set<string>();
  for (const { from, to } of redirects) {
    const at = `content/${REDIRECTS_FILE}: ${from} → ${to}`;
    const slug = from.slice(1);
    if (!from.startsWith("/") || !SLUG.test(slug)) {
      problems.push(`${at}: the old address must be / followed by lowercase letters, digits and hyphens`);
    } else if (reserved.has(slug)) {
      problems.push(`${at}: ${from} is reserved by the site and cannot be redirected`);
    } else if (isSiteRoute(from, routes)) {
      problems.push(`${at}: ${from} is a page, so it cannot also be redirected`);
    }
    if (seen.has(from)) problems.push(`${at}: ${from} is redirected more than once`);
    seen.add(from);

    if (to === from) {
      problems.push(`${at}: a redirect cannot lead to itself`);
    } else if (to.startsWith("/")) {
      const target = to.split(/[?#]/)[0];
      if (sources.has(target)) {
        problems.push(`${at}: ${target} is itself redirected; chains and loops are not allowed, point at the final page`);
      } else if (hrefProblem(to) !== null || !isSiteRoute(to, routes)) {
        problems.push(`${at}: ${to} is not a page on this site`);
      }
    } else if (!to.startsWith("https://") || hrefProblem(to) !== null) {
      problems.push(`${at}: the new address must be a page on this site (starting with /) or an https: address`);
    }
  }
  return problems;
}
