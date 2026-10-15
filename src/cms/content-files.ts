import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { pagePath } from "./pages";
import { problemPathKey, publishChecks } from "./publish-checks";
import { parseRedirects, printRedirects, readRedirectsText, redirectProblems, REDIRECTS_FILE } from "./redirects";
import { siteRoutes, type Route } from "./routes";
import { DOCUMENT_PATH, IMAGE_PATH, pageSchema } from "./schema";
import { reservedSlugs, slugProblems } from "./slugs";

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

/**
 * The slugs of the content files in a directory, sorted. Files whose names start with `_`
 * hold site settings (such as `_redirects.json`), not pages.
 */
export function contentSlugs(contentDir: string): string[] {
  return fs
    .readdirSync(contentDir)
    .filter((name) => name.endsWith(".json") && !name.startsWith("_"))
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

/**
 * The hash a draft records of the file it started from: the file's git blob id, so the
 * publish step can compare it with the id GitHub reports for the file on `main`.
 */
export function contentHash(text: string): string {
  return createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest("hex");
}

/** A content file's text and hash, or null when the page has no file. */
export function readContentFile(contentDir: string, slug: string): { text: string; hash: string } | null {
  if (!contentSlugs(contentDir).includes(slug)) return null;
  const text = fs.readFileSync(path.join(contentDir, `${slug}.json`), "utf8");
  return { text, hash: contentHash(text) };
}

/**
 * Checks one content file's text as it would be committed: valid, in canonical form, and
 * passing the publish checks (`./publish-checks`). `routes` should include the content pages
 * (see `contentRoutes`). Returns one message per problem; none means the file may be
 * committed. The publish step calls this on the file it generates.
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
  return publishChecks(slug, JSON.parse(text), { publicDir, routes }).map(
    (problem) => `${file}: ${[problemPathKey(problem.path), problem.message].filter(Boolean).join(": ")}`,
  );
}

/** The routes content may link to: app pages, public files, and the given content pages. */
export function contentRoutes(dirs: Dirs, slugs: string[]): Route[] {
  return siteRoutes({ appDir: dirs.appDir, publicDir: dirs.publicDir, contentPaths: slugs.map(pagePath) });
}

/** The images content may use: every file in `public/images/` an image field accepts, as site paths, sorted. */
export function siteImages(publicDir: string): string[] {
  const dir = path.join(publicDir, "images");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((name) => `/images/${name}`)
    .filter((image) => IMAGE_PATH.test(image))
    .sort();
}

/** The PDFs a document field accepts: every matching file in `public/documents/`, as site paths, sorted. */
export function siteDocuments(publicDir: string): string[] {
  const dir = path.join(publicDir, "documents");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((name) => `/documents/${name}`)
    .filter((file) => DOCUMENT_PATH.test(file))
    .sort();
}

/** Checks the redirects file's text: valid, canonical, and following the rules in `./redirects`. */
export function checkRedirectsText(text: string, dirs: Dirs, routes: Route[]): string[] {
  let redirects;
  try {
    redirects = parseRedirects(text);
  } catch (e) {
    return [(e as Error).message];
  }
  if (printRedirects(redirects) !== text) return [`content/${REDIRECTS_FILE} is not in canonical form; run npm run content:format`];
  return redirectProblems(redirects, { reserved: reservedSlugs(dirs), routes });
}

/**
 * Checks the whole content directory: every page with `checkContentText`, every page's
 * address (`./slugs`), and the redirects.
 */
export function checkContent(dirs: Dirs): string[] {
  const slugs = contentSlugs(dirs.contentDir);
  const routes = contentRoutes(dirs, slugs);
  const redirects = readRedirectsText(dirs.contentDir);
  return [
    ...slugProblems(slugs, dirs),
    ...slugs.flatMap((slug) =>
      checkContentText(slug, fs.readFileSync(path.join(dirs.contentDir, `${slug}.json`), "utf8"), dirs.publicDir, routes),
    ),
    ...(redirects === null ? [] : checkRedirectsText(redirects, dirs, routes)),
  ];
}

/**
 * Rewrites every content file, and the redirects file, into canonical form. Returns the
 * names (slugs, or `_redirects`) of the files that changed.
 */
export function formatContentFiles(contentDir: string): string[] {
  const changed: string[] = [];
  const redirects = readRedirectsText(contentDir);
  if (redirects !== null) {
    const formatted = printRedirects(parseRedirects(redirects));
    if (formatted !== redirects) {
      fs.writeFileSync(path.join(contentDir, REDIRECTS_FILE), formatted);
      changed.push(REDIRECTS_FILE.slice(0, -".json".length));
    }
  }
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
