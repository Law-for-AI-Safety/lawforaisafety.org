import fs from "node:fs";
import path from "node:path";
import { type BlockType } from "./pages";
import { parseRichTextLoose } from "./rich-text";
import { isSiteRoute, type Route } from "./routes";
import { DOCUMENT_PATH, IMAGE_PATH, pageSchema } from "./schema";

/**
 * The checks a page must pass before it may be published, shared by the editor (on every
 * save), the publish action, and `npm run content:check` in CI:
 *
 * - every field valid under the page schema, which covers a title and description, no empty
 *   required field, well-formed links, the page's block rules, and alt text with every photo
 * - every image and document it uses present in `public/`
 * - every site link, in text or on a button, leading to a real page
 * - exactly one H1
 *
 * Each problem carries the path of the field it is about, as zod reports it.
 */

export type ProblemPath = (string | number)[];
export type Problem = { path: ProblemPath; message: string };
export type CheckContext = { publicDir: string; routes: Route[] };

/** Block types whose component renders a page heading (H1). */
const H1_BLOCKS: ReadonlySet<BlockType> = new Set<BlockType>(["hero"]);

/** Every string in a value, with its path. */
function strings(value: unknown, at: ProblemPath = []): [ProblemPath, string][] {
  if (typeof value === "string") return [[at, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, [...at, i]));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => strings(v, [...at, k]));
  return [];
}

/** The link targets in a string that reads as rich text; none when it does not. */
function linksInText(text: string): string[] {
  let doc;
  try {
    doc = parseRichTextLoose(text);
  } catch {
    return [];
  }
  const runs = doc.flatMap((block) => (block.type === "paragraph" ? block.runs : block.items.flat()));
  return runs.flatMap((run) => (run.marks.link === undefined ? [] : [run.marks.link]));
}

/** Fields that hold a repo image: the share image, team photos, and photos in a list of photos. */
const IMAGE_KEYS = new Set(["shareImage", "photo", "image"]);
/** Fields that hold a repo PDF: a text section's document. */
const DOCUMENT_KEYS = new Set(["file"]);

/** The repo files of one kind a page value uses, with their paths. */
function filesIn(value: Record<string, unknown>, keys: Set<string>): [ProblemPath, string][] {
  return strings(value).filter(([at]) => keys.has(String(at[at.length - 1])));
}

/** Every link target in a page value: those inside rich text, and each button's own `href`. */
function linksIn(value: Record<string, unknown>): [ProblemPath, string][] {
  return strings(value).flatMap(([at, text]): [ProblemPath, string][] =>
    at[at.length - 1] === "href" ? [[at, text]] : linksInText(text).map((href) => [at, href]),
  );
}

export function publishChecks(slug: string, value: unknown, { publicDir, routes }: CheckContext): Problem[] {
  const result = pageSchema(slug).safeParse(value);
  const problems: Problem[] = result.success
    ? []
    : result.error.issues.map((issue) => ({ path: issue.path as ProblemPath, message: issue.message }));
  if (!value || typeof value !== "object" || Array.isArray(value)) return problems;
  const page = value as Record<string, unknown>;

  for (const [at, image] of filesIn(page, IMAGE_KEYS)) {
    // Only a well-formed path is looked up; the schema reports any other.
    if (IMAGE_PATH.test(image) && !fs.existsSync(path.join(publicDir, image))) {
      problems.push({ path: at, message: `The image ${image} does not exist` });
    }
  }
  for (const [at, file] of filesIn(page, DOCUMENT_KEYS)) {
    if (DOCUMENT_PATH.test(file) && !fs.existsSync(path.join(publicDir, file))) {
      problems.push({ path: at, message: `The document ${file} does not exist` });
    }
  }
  for (const [at, href] of linksIn(page)) {
    if (href.startsWith("/") && !isSiteRoute(href, routes)) {
      problems.push({ path: at, message: `The link ${href} does not lead to a page on this site` });
    }
  }
  const blocks = Array.isArray(page.blocks) ? page.blocks : [];
  const h1s = blocks.filter((block) => H1_BLOCKS.has(block?.type)).length;
  if (h1s !== 1) {
    problems.push({
      path: ["blocks"],
      message: `A page needs exactly one main heading (from its hero block); this one has ${h1s}`,
    });
  }
  return problems;
}

/** A problem's path as one key, e.g. "blocks.3.items.2.body"; empty for the page itself. */
export function problemPathKey(at: ProblemPath): string {
  return at.join(".");
}
