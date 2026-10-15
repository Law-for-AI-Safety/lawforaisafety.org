import fs from "node:fs";
import path from "node:path";

/**
 * The site paths a content link may point at, worked out from the files rather than a list
 * kept by hand: every page under `src/app` (outside `/admin` and `/api`), every file under
 * `public/`, and every content page.
 */

/** One route as segments. Dynamic segments are written as Next names them, e.g. `[locale]`. */
export type Route = string[];

const PAGE_FILE = /^page\.(tsx|ts|jsx|js|mdx)$/;
/** Site areas content never links into. */
const NOT_LINKABLE = new Set(["admin", "api"]);

/** Every page route under an App Router directory. */
export function appRoutes(appDir: string): Route[] {
  const routes: Route[] = [];
  const walk = (dir: string, segments: string[]) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && PAGE_FILE.test(entry.name)) routes.push(segments);
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      // Private folders and parallel-route slots hold no URL segment of their own to link to.
      if (name.startsWith("_") || name.startsWith("@")) continue;
      // Route groups shape layouts, not URLs.
      const next = /^\(.*\)$/.test(name) ? segments : [...segments, name];
      if (next.length === 1 && NOT_LINKABLE.has(next[0])) continue;
      walk(path.join(dir, name), next);
    }
  };
  walk(appDir, []);
  return routes;
}

/** Every file under a public directory, as a route of its URL segments. */
export function publicRoutes(publicDir: string): Route[] {
  return fs
    .readdirSync(publicDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(publicDir, path.join(entry.parentPath, entry.name)).split(path.sep));
}

function matches(route: Route, segments: string[]): boolean {
  if (route.length === 0) return segments.length === 0;
  const [head, ...rest] = route;
  if (/^\[\[\.\.\..+\]\]$/.test(head)) return true;
  if (/^\[\.\.\..+\]$/.test(head)) return segments.length > 0;
  if (segments.length === 0) return false;
  if (/^\[.+\]$/.test(head) || head === segments[0]) return matches(rest, segments.slice(1));
  return false;
}

/**
 * Whether a site link (`/path`, with any query or fragment) leads to one of `routes`.
 * A trailing slash does not match, except on the homepage.
 */
export function isSiteRoute(href: string, routes: Route[]): boolean {
  const pathname = href.split(/[?#]/)[0];
  if (!pathname.startsWith("/")) return false;
  if (pathname === "/") return routes.some((route) => matches(route, []));
  let segments: string[];
  try {
    segments = pathname.slice(1).split("/").map(decodeURIComponent);
  } catch {
    return false;
  }
  if (segments.some((s) => s === "" || s === "." || s === "..")) return false;
  return routes.some((route) => matches(route, segments));
}

/** All the site's linkable routes: app pages, public files and content pages. */
export function siteRoutes({
  appDir,
  publicDir,
  contentPaths,
}: {
  appDir: string;
  publicDir: string;
  contentPaths: string[];
}): Route[] {
  return [
    ...appRoutes(appDir),
    ...publicRoutes(publicDir),
    ...contentPaths.map((p) => p.split("/").filter(Boolean)),
  ];
}
