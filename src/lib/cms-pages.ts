import { contentRoutes, contentSlugs, defaultDirs, readContentFile, siteImages } from "@/cms/content-files";
import { pageState, type PageState } from "@/cms/drafts";
import { publishChecks, type Problem } from "@/cms/publish-checks";
import { getDraft, listDrafts, type DraftRow } from "@/lib/cms-store";

/**
 * What the CMS admin pages and actions read about a page: its content file (from the deployed
 * `content/` directory, traced into the admin functions by next.config.ts) and its draft.
 */

export function cmsDirs() {
  return defaultDirs(process.cwd());
}

export function cmsPageSlugs(): string[] {
  return contentSlugs(cmsDirs().contentDir);
}

/** The publish checks against this deployment's pages, images and routes. */
export function checkPage(slug: string, value: unknown): Problem[] {
  const dirs = cmsDirs();
  return publishChecks(slug, value, {
    publicDir: dirs.publicDir,
    routes: contentRoutes(dirs, contentSlugs(dirs.contentDir)),
  });
}

export function cmsImages(): string[] {
  return siteImages(cmsDirs().publicDir);
}

export type CmsPageSummary = {
  slug: string;
  title: string;
  state: PageState;
  draft: { authorEmail: string; updatedAt: Date; valid: boolean } | null;
};

export async function listCmsPages(): Promise<CmsPageSummary[]> {
  const dirs = cmsDirs();
  const drafts = new Map((await listDrafts()).map((d) => [d.page, d]));
  return contentSlugs(dirs.contentDir).map((slug) => {
    const file = readContentFile(dirs.contentDir, slug)!;
    const draft = drafts.get(slug) ?? null;
    const state = pageState(slug, draft?.content ?? null, file.text);
    return {
      slug,
      title: (JSON.parse(file.text) as { title: string }).title,
      state,
      draft: draft && state === "draft" ? { authorEmail: draft.authorEmail, updatedAt: draft.updatedAt, valid: draft.valid } : null,
    };
  });
}

export type CmsPage = {
  slug: string;
  file: { text: string; hash: string };
  draft: DraftRow | null;
  /** The draft's content, or the content file's when there is no draft. */
  content: unknown;
  /** The draft version a save must start from; 0 when there is no draft. */
  version: number;
  state: PageState;
};

/** A page and its draft, or null when there is no content file for `slug`. */
export async function loadCmsPage(slug: string): Promise<CmsPage | null> {
  const file = readContentFile(cmsDirs().contentDir, slug);
  if (!file) return null;
  const draft = await getDraft(slug);
  return {
    slug,
    file,
    draft,
    content: draft ? draft.content : JSON.parse(file.text),
    version: draft?.version ?? 0,
    state: pageState(slug, draft?.content ?? null, file.text),
  };
}
