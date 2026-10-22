import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { opportunitySchema, parseOpportunity } from "./schema";
import type { Opportunity } from "./types";

/**
 * Reading, formatting and checking the files in `content/opportunities/`. Mirrors
 * `src/cms/content-files.ts`'s role for CMS pages, but much simpler: no drafts, no routes to
 * cross-check links against, no redirects - just one file per opportunity, keyed by slug.
 */

export const OPPORTUNITIES_DIR = "content/opportunities";

export function defaultOpportunitiesDir(root = process.cwd()): string {
  return path.join(root, "content", "opportunities");
}

export function opportunityFilePath(slug: string): string {
  return `${OPPORTUNITIES_DIR}/${slug}.json`;
}

/** The slugs of the opportunity files in a directory, sorted. */
export function opportunitySlugs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .sort();
}

export class OpportunityFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpportunityFileError";
  }
}

/** Prints an opportunity's content the one canonical way: two-space indent, schema key order, final newline. */
export function printOpportunity(value: Opportunity): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Rewrites an opportunity file's text into canonical form, and checks the filename matches
 * the slug inside it. Throws an `OpportunityFileError` when it is not valid JSON, does not
 * match the schema, or the filename and slug disagree.
 */
export function formatOpportunityText(slug: string, text: string): string {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw new OpportunityFileError(`${opportunityFilePath(slug)} is not valid JSON: ${(e as Error).message}`);
  }
  const result = opportunitySchema.safeParse(value);
  if (!result.success) {
    throw new OpportunityFileError(`${opportunityFilePath(slug)} is invalid:\n${z.prettifyError(result.error)}`);
  }
  if (result.data.slug !== slug) {
    throw new OpportunityFileError(`${opportunityFilePath(slug)} has slug "${result.data.slug}", which does not match its filename`);
  }
  return printOpportunity(result.data);
}

/** Every opportunity in a directory, parsed. Throws if any file is invalid. */
export function readOpportunityFiles(dir: string): Opportunity[] {
  return opportunitySlugs(dir).map((slug) => {
    const text = fs.readFileSync(path.join(dir, `${slug}.json`), "utf8");
    const opportunity = parseOpportunity(JSON.parse(text));
    if (opportunity.slug !== slug) {
      throw new OpportunityFileError(`${opportunityFilePath(slug)} has slug "${opportunity.slug}", which does not match its filename`);
    }
    return opportunity;
  });
}

/**
 * Like `readOpportunityFiles`, but skips (logging a warning) any file that isn't a complete,
 * valid listing instead of throwing - used by the live site, where a pending import's stub
 * file (`{ url }`, before the import script fills it in) merged to `main` too early must not
 * take the whole board down. `npm run opportunities:check` (`checkOpportunityFiles`) is what
 * catches that kind of file with a loud, specific failure before it reaches `main`.
 */
export function readValidOpportunityFiles(dir: string): Opportunity[] {
  const opportunities: Opportunity[] = [];
  for (const slug of opportunitySlugs(dir)) {
    try {
      const text = fs.readFileSync(path.join(dir, `${slug}.json`), "utf8");
      const opportunity = parseOpportunity(JSON.parse(text));
      if (opportunity.slug !== slug) {
        throw new OpportunityFileError(`${opportunityFilePath(slug)} has slug "${opportunity.slug}", which does not match its filename`);
      }
      opportunities.push(opportunity);
    } catch (e) {
      console.error(`[opportunities] skipping ${opportunityFilePath(slug)}: ${(e as Error).message}`);
    }
  }
  return opportunities;
}

/**
 * Checks the whole opportunities directory: every file valid, in canonical form, filename
 * matching its slug, and every slug unique (duplicate filenames can't occur on a filesystem,
 * but a renamed-then-reimported listing could still collide; checked anyway for a clear message).
 */
export function checkOpportunityFiles(dir: string): string[] {
  const slugs = opportunitySlugs(dir);
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const slug of slugs) {
    if (seen.has(slug)) {
      problems.push(`${opportunityFilePath(slug)}: duplicate slug`);
      continue;
    }
    seen.add(slug);
    const file = path.join(dir, `${slug}.json`);
    const text = fs.readFileSync(file, "utf8");
    try {
      const formatted = formatOpportunityText(slug, text);
      if (formatted !== text) problems.push(`${opportunityFilePath(slug)} is not in canonical form (two-space indent, schema key order, final newline)`);
    } catch (e) {
      problems.push((e as Error).message);
    }
  }
  return problems;
}
