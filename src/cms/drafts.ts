import { z } from "zod";
import { printContent } from "./content-files";
import type { DraftPage } from "./editor-model";
import { pageSchema } from "./schema";

/**
 * Drafts as the editor saves them: the content-file value, possibly unfinished. A draft must
 * keep the page's shape (see the "draft" schema mode) to be saved at all; it is valid when it
 * passes the strict schema.
 */

/** Draft versus Live. Live means no draft differs from the content file. */
export type PageState = "draft" | "live";

export function parseDraft(slug: string, value: unknown): { ok: true; value: DraftPage } | { ok: false; message: string } {
  const result = pageSchema(slug, "draft").safeParse(value);
  if (result.success) return { ok: true, value: result.data as DraftPage };
  return { ok: false, message: `The draft is not in the shape of a page:\n${z.prettifyError(result.error)}` };
}

export function isValidDraft(slug: string, value: unknown): boolean {
  return pageSchema(slug).safeParse(value).success;
}

/** Whether a draft would write exactly the content file's text. */
export function draftMatchesFile(slug: string, value: unknown, fileText: string): boolean {
  const result = pageSchema(slug).safeParse(value);
  return result.success && printContent(result.data) === fileText;
}

export function pageState(slug: string, draft: unknown, fileText: string): PageState {
  return draft === null || draft === undefined || draftMatchesFile(slug, draft, fileText) ? "live" : "draft";
}
