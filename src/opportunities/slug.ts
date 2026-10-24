import { SLUG } from "./schema";

/**
 * Turns free text (an opportunity's org and title) into a slug matching `SLUG`
 * (`src/opportunities/schema.ts`), and dedupes it against the slugs already in use.
 */

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** `base`, or `base-2`, `base-3`, ... the first one not already in `existing`. */
export function uniqueSlug(base: string, existing: ReadonlySet<string>): string {
  const root = SLUG.test(base) ? base : slugify(base) || "opportunity";
  if (!existing.has(root)) return root;
  for (let n = 2; ; n++) {
    const candidate = `${root}-${n}`;
    if (!existing.has(candidate)) return candidate;
  }
}
