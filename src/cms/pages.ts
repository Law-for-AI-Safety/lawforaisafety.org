import { APPLY_PAGES, type ApplicationSource } from "../lib/application-pages";

/**
 * What each content page may hold. A page's content file is `content/<slug>.json`; a slug
 * with no entry here has no rules, so its file is refused.
 *
 * `blocks` lists the block types the page allows with the most of each it may have. The hero
 * is always first and appears exactly once. `forms` lists the application forms the page's
 * application section may show.
 */
export const BLOCK_TYPES = [
  "hero",
  "quoteBand",
  "textSection",
  "cardList",
  "teamGrid",
  "timeline",
  "applicationSection",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const FORM_TYPES = ["apply", "redLines"] as const;
export type FormType = (typeof FORM_TYPES)[number];

export type PageRules = {
  blocks: Partial<Record<BlockType, number>>;
  forms: readonly FormType[];
};

export const PAGE_RULES: Record<string, PageRules> = {
  "field-building": {
    blocks: { hero: 1, quoteBand: 2, textSection: 4, cardList: 4, timeline: 1, applicationSection: 1 },
    forms: ["apply"],
  },
};

export function pageRules(slug: string): PageRules | undefined {
  return Object.hasOwn(PAGE_RULES, slug) ? PAGE_RULES[slug] : undefined;
}

/** The site path a content page is served at. */
export function pagePath(slug: string): string {
  return `/${slug}`;
}

/**
 * The application source (stored with each application) for the apply form on the page at
 * `path`, from the registry in `src/lib/application-pages.ts`. Undefined when the page has
 * no entry there, in which case it cannot show the apply form.
 */
export function applySourceFor(path: string): ApplicationSource | undefined {
  const sources = Object.keys(APPLY_PAGES) as ApplicationSource[];
  return sources.find((source) => APPLY_PAGES[source].path === path);
}
