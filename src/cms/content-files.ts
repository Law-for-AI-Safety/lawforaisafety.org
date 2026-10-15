import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { pagePath } from "./pages";
import { parseRichTextLoose } from "./rich-text";
import { isSiteRoute, siteRoutes, type Route } from "./routes";
import { pageSchema, type PageContent } from "./schema";

/**
 * Reading, formatting and checking the files in `content/`. Used by `npm run content:format`
 * and `npm run content:check` (scripts/content.ts), by the tests, and by the publish step
 * that writes a content file into a pull request.
 */

export type Dirs = { contentDir: string; appDir: string; publicDir: string };

export function defaultDirs(root = process.cwd()): Dirs {
  return {
    contentDir: path.join(root, "content"),
    appDir: path.join(root, "src", "app"),
    publicDir: path.join(root, "public"),
  };
}

/** The slugs of the content files in a directory, sorted. */
export function contentSlugs(contentDir: string): string[] {
  return fs
    .readdirSync(contentDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .sort();
}

export class ContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentError";
  }
}

/** Prints a content value the one canonical way: two-space indent, schema key order, final newline. */
export function printContent(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Rewrites a content file's text into canonical form. Throws a ContentError when it is not
 * valid JSON or does not match the schema even after formatting.
 */
export function formatContent(slug: string, text: string): string {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw new ContentError(`content/${slug}.json is not valid JSON: ${(e as Error).message}`);
  }
  const result = pageSchema(slug, "format").safeParse(value);
  if (!result.success) {
    throw new ContentError(`content/${slug}.json is invalid:\n${z.prettifyError(result.error)}`);
  }
  return printContent(result.data);
}

/** Every link target in a content value, found in any string that reads as rich text. */
export function linksIn(value: unknown): string[] {
  if (typeof value === "string") {
    let doc;
    try {
      doc = parseRichTextLoose(value);
    } catch {
      return [];
    }
    const runs = doc.flatMap((block) => (block.type === "paragraph" ? block.runs : block.items.flat()));
    return runs.flatMap((run) => (run.marks.link === undefined ? [] : [run.marks.link]));
  }
  if (Array.isArray(value)) return value.flatMap(linksIn);
  if (value && typeof value === "object") return Object.values(value).flatMap(linksIn);
  return [];
}

/** Every repo image a page uses: its share image and team photos. */
export function imagesIn(page: PageContent): string[] {
  const photos = page.blocks.flatMap((block) =>
    block.type === "teamGrid" ? block.members.flatMap((m) => (m.photo ? [m.photo] : [])) : [],
  );
  return [...(page.shareImage ? [page.shareImage] : []), ...photos];
}

/**
 * Checks one content file's text as it would be committed: valid, in canonical form, every
 * image present in public/, and every site link leading to a real route. `routes` should
 * include the content pages (see `contentRoutes`). Returns one message per problem; none
 * means the file may be committed. The publish step calls this on the file it generates.
 */
export function checkContentText(slug: string, text: string, publicDir: string, routes: Route[]): string[] {
  const file = `content/${slug}.json`;
  let formatted: string;
  try {
    formatted = formatContent(slug, text);
  } catch (e) {
    return [(e as Error).message];
  }
  if (formatted !== text) return [`${file} is not in canonical form; run npm run content:format`];
  const page = pageSchema(slug).parse(JSON.parse(text));
  const problems: string[] = [];
  for (const image of imagesIn(page)) {
    if (!fs.existsSync(path.join(publicDir, image))) problems.push(`${file}: image ${image} is not in public/`);
  }
  for (const href of linksIn(page)) {
    if (href.startsWith("/") && !isSiteRoute(href, routes)) {
      problems.push(`${file}: link ${href} does not lead to a page on this site`);
    }
  }
  return problems;
}

/** The routes content may link to: app pages, public files, and the given content pages. */
export function contentRoutes(dirs: Dirs, slugs: string[]): Route[] {
  return siteRoutes({ appDir: dirs.appDir, publicDir: dirs.publicDir, contentPaths: slugs.map(pagePath) });
}

/** Checks every file in the content directory with `checkContentText`. */
export function checkContent(dirs: Dirs): string[] {
  const slugs = contentSlugs(dirs.contentDir);
  const routes = contentRoutes(dirs, slugs);
  return slugs.flatMap((slug) =>
    checkContentText(slug, fs.readFileSync(path.join(dirs.contentDir, `${slug}.json`), "utf8"), dirs.publicDir, routes),
  );
}

/** Rewrites every content file into canonical form. Returns the slugs whose files changed. */
export function formatContentFiles(contentDir: string): string[] {
  const changed: string[] = [];
  for (const slug of contentSlugs(contentDir)) {
    const file = path.join(contentDir, `${slug}.json`);
    const text = fs.readFileSync(file, "utf8");
    const formatted = formatContent(slug, text);
    if (formatted !== text) {
      fs.writeFileSync(file, formatted);
      changed.push(slug);
    }
  }
  return changed;
}
