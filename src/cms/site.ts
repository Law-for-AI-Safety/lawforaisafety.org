import fs from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";
import { contentSlugs, defaultDirs, type Dirs } from "./content-files";
import { HOME_SLUG, pagePath } from "./pages";
import { appRoutes } from "./routes";
import { parsePage, type PageContent } from "./schema";
import { contentRouteSlugs, reservedSlugs, slugProblem } from "./slugs";

/**
 * The public site's content pages, read from the files at build time: what the content route
 * (`src/app/[slug]`), the share images and the sitemap are built from. Nothing here reads the
 * database.
 *
 * `extraContentDir` adds the pages of a second directory, for test builds only: setting
 * `CMS_EXTRA_CONTENT_DIR=test/fixtures/content` builds the test page in that fixture without
 * putting it on the real site. A slug in both directories is an error.
 */

export type SiteDirs = Dirs & { extraContentDir?: string };

export function siteDirs(root = process.cwd(), env: Record<string, string | undefined> = process.env): SiteDirs {
  const extra = env.CMS_EXTRA_CONTENT_DIR;
  return { ...defaultDirs(root), ...(extra ? { extraContentDir: path.resolve(root, extra) } : {}) };
}

export type SitePage = { slug: string; path: string; page: PageContent };

function readPage(dir: string, slug: string): SitePage {
  const value: unknown = JSON.parse(fs.readFileSync(path.join(dir, `${slug}.json`), "utf8"));
  return { slug, path: pagePath(slug), page: parsePage(slug, value) };
}

/** Every content page, from `content/` and then the extra directory. Throws on an invalid file. */
export function sitePages(dirs: SiteDirs): SitePage[] {
  const pages = contentSlugs(dirs.contentDir).map((slug) => readPage(dirs.contentDir, slug));
  if (!dirs.extraContentDir) return pages;
  const extra = dirs.extraContentDir;
  for (const slug of contentSlugs(extra)) {
    if (pages.some((p) => p.slug === slug)) throw new Error(`${slug}.json is in both ${dirs.contentDir} and ${extra}`);
    pages.push(readPage(extra, slug));
  }
  return pages;
}

/** The pages the content route serves: every content page without a route of its own. */
export function contentRoutePages(dirs: SiteDirs): SitePage[] {
  const pages = sitePages(dirs);
  const served = new Set(contentRouteSlugs(pages.map((p) => p.slug), dirs));
  return pages.filter((p) => served.has(p.slug));
}

/** The content route's page for `slug`, or null when the route does not serve it (a 404). */
export function contentRoutePage(dirs: SiteDirs, slug: string): SitePage | null {
  return contentRoutePages(dirs).find((p) => p.slug === slug) ?? null;
}

/**
 * The content pages visitors can reach: those served by the content route or by a route of
 * their own. A file whose slug breaks the rules is in neither (and fails `content:check`).
 */
export function servedPages(dirs: SiteDirs): SitePage[] {
  const reserved = reservedSlugs(dirs);
  return sitePages(dirs).filter((p) => slugProblem(p.slug, dirs, reserved) === null);
}

/** Pages that get a share image made from their title: every served page but the homepage, which keeps the site's own. */
export function titleCardPages(dirs: SiteDirs): SitePage[] {
  return servedPages(dirs).filter((p) => p.slug !== HOME_SLUG);
}

export const SITE_URL = "https://lawforaisafety.org";

/**
 * Pages under these paths stay out of the sitemap: the steps of the application and
 * newsletter flows, and the privacy policy, which `src/app/sitemap.ts` adds itself with its
 * language versions while it is served.
 */
export const NOT_IN_SITEMAP = ["apply", "newsletter", "privacy-policy", "red-lines-dialogue/confirm", "red-lines-dialogue/retry"];

type Hint = Pick<MetadataRoute.Sitemap[number], "changeFrequency" | "priority">;
const DEFAULT_HINT: Hint = { changeFrequency: "monthly", priority: 0.6 };
const HINTS: Record<string, Hint> = {
  "/": { changeFrequency: "monthly", priority: 1 },
  "/red-lines-dialogue": { changeFrequency: "weekly", priority: 0.7 },
};

/**
 * The sitemap's page entries: every content page, dated by its file's `updatedAt`, and every
 * other public page of the App Router. Those have no date of their own, so they carry none
 * rather than claim to change on every build. The homepage comes first, the rest by path.
 */
export function sitemapEntries(dirs: SiteDirs): MetadataRoute.Sitemap {
  const dated = new Map(servedPages(dirs).map((p) => [p.path, new Date(p.page.updatedAt)]));
  const appPaths = appRoutes(dirs.appDir)
    .filter((route) => !route.some((segment) => segment.startsWith("[")))
    .map((route) => route.join("/"))
    .filter((route) => !NOT_IN_SITEMAP.some((prefix) => route === prefix || route.startsWith(`${prefix}/`)))
    .map((route) => `/${route}`);
  const paths = [...new Set([...dated.keys(), ...appPaths])].sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)));
  return paths.map((p) => {
    const lastModified = dated.get(p);
    return {
      url: p === "/" ? SITE_URL : `${SITE_URL}${p}`,
      ...(lastModified ? { lastModified } : {}),
      ...(Object.hasOwn(HINTS, p) ? HINTS[p] : DEFAULT_HINT),
    };
  });
}
