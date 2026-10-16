import fs from "node:fs";
import path from "node:path";
import { HOME_SLUG } from "./pages";

/**
 * Which slugs a content page may have, and which route serves each page.
 *
 * A slug is lowercase letters, digits and single hyphens. It must not name a URL the site
 * already uses: the fixed list below, every top-level name under `src/app` (folders, and
 * the stems of files such as `sitemap.ts` or `icon.svg`), and every top-level folder in
 * `public/`. These are read from the filesystem, so a new route folder reserves its name
 * without a list to keep up to date.
 *
 * A page whose slug is reserved is still allowed when its own route renders it: the route
 * file at `src/app/<slug>/page.tsx` (or `src/app/page.tsx` for the homepage) reads
 * `content/<slug>.json`. Such a page has a "dedicated route"; every other page is served by
 * the content route, `src/app/[slug]`.
 */

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 60;

/** Never a content page's own URL, whatever the filesystem holds. */
export const FIXED_RESERVED = ["admin", "api", "apply", "newsletter", "og-assets", "privacy-policy"] as const;

export type SlugDirs = { appDir: string; publicDir: string };

const PAGE_FILE = /^page\.(tsx|ts|jsx|js|mdx)$/;

/** The URL segments a directory of the App Router claims at its top level. */
function topLevelNames(appDir: string): string[] {
  const names: string[] = [];
  for (const entry of fs.readdirSync(appDir, { withFileTypes: true })) {
    const name = entry.name;
    if (entry.isDirectory()) {
      if (name.startsWith("_") || name.startsWith("@") || name.startsWith("[")) continue;
      // A route group adds no segment: the folders inside it are top-level URLs.
      if (/^\(.*\)$/.test(name)) names.push(...topLevelNames(path.join(appDir, name)));
      else names.push(name);
    } else {
      names.push(name.replace(/\..*$/, ""));
    }
  }
  return names;
}

/** Every slug no content page may take as a new URL. */
export function reservedSlugs({ appDir, publicDir }: SlugDirs): Set<string> {
  const publicFolders = fs
    .readdirSync(publicDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  return new Set([...FIXED_RESERVED, HOME_SLUG, ...topLevelNames(appDir), ...publicFolders]);
}

/** The route file that would serve `slug` itself, if there is one. */
function routeFile(appDir: string, slug: string): string | null {
  const dir = slug === HOME_SLUG ? appDir : path.join(appDir, slug);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  const file = fs.readdirSync(dir).find((name) => PAGE_FILE.test(name));
  return file ? path.join(dir, file) : null;
}

/** The module specifiers a source file imports, with comments left out. */
export function importedModules(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // A line comment starts the line or follows a space, so `https://` in a string survives.
    .replace(/(^|\s)\/\/.*$/gm, "$1");
  const specifiers: string[] = [];
  for (const match of code.matchAll(/(?:^|[;\s])import\s+(?:[\w*{}\s,]+\s+from\s+)?["']([^"']+)["']/g)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

/**
 * Whether `slug` has its own route that renders `content/<slug>.json`: its page file imports
 * a file at `content/<slug>.json` (by a relative path, or by `@/` for `src/`). A mention in a
 * comment or a string does not count.
 */
export function hasDedicatedRoute({ appDir }: SlugDirs, slug: string): boolean {
  const file = routeFile(appDir, slug);
  if (file === null) return false;
  const target = `${path.sep}${path.join("content", `${slug}.json`)}`;
  const srcDir = path.dirname(appDir);
  // Read only at build time (and by the checks); the comment stops Turbopack tracing the
  // whole project into the server functions because of this one dynamic path.
  const source = fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8");
  return importedModules(source).some((specifier) => {
    if (specifier.startsWith("@/")) return path.join(srcDir, specifier.slice(2)).endsWith(target);
    return specifier.startsWith(".") && path.resolve(path.dirname(file), specifier).endsWith(target);
  });
}

/** Why `slug` cannot be a content page, or null when it can. */
export function slugProblem(slug: string, dirs: SlugDirs, reserved = reservedSlugs(dirs)): string | null {
  if (slug.length > MAX_SLUG_LENGTH) return `The page address "${slug}" is longer than ${MAX_SLUG_LENGTH} characters`;
  if (!SLUG.test(slug)) {
    return `The page address "${slug}" may use only lowercase letters, digits and single hyphens between them`;
  }
  if (reserved.has(slug) && !hasDedicatedRoute(dirs, slug)) {
    return `The page address "/${slug}" is already used by the site`;
  }
  return null;
}

/** One message per content slug that breaks the rules above. Slugs come from file names, so are unique. */
export function slugProblems(slugs: string[], dirs: SlugDirs): string[] {
  const reserved = reservedSlugs(dirs);
  return slugs.flatMap((slug) => {
    const problem = slugProblem(slug, dirs, reserved);
    return problem ? [`content/${slug}.json: ${problem}`] : [];
  });
}

/** The pages the content route serves: valid slugs without a dedicated route. */
export function contentRouteSlugs(slugs: string[], dirs: SlugDirs): string[] {
  const reserved = reservedSlugs(dirs);
  return slugs.filter((slug) => slugProblem(slug, dirs, reserved) === null && !reserved.has(slug));
}
