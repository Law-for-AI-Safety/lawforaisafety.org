"use server";

import { z } from "zod";
import { contentHash } from "@/cms/content-files";
import { isValidDraft, pageState, parseDraft, type PageState } from "@/cms/drafts";
import type { Problem } from "@/cms/publish-checks";
import { recordAdminAction } from "@/lib/audit-log";
import { requireCms } from "@/lib/cms-access";
import { checkPage, loadCmsPage } from "@/lib/cms-pages";
import { deleteDraft, writeDraft } from "@/lib/cms-store";

/**
 * The CMS editor's server actions. Each is a public endpoint: it checks the caller's
 * permission itself (`requireCms`, read from the database on every call) and validates every
 * argument, whatever the editor UI shows.
 */

const slugArg = z.string().max(100);
const versionArg = z.number().int().min(0).max(2_147_483_647);

const CONFLICT =
  "Someone else changed this page since you opened it. Reload the page to see their changes; edits you made since then were not saved.";

type Refusal = { ok: false; reason: "signed_out" | "forbidden" | "invalid" | "conflict" | "not_found"; message: string };

export type SaveDraftResult =
  | { ok: true; version: number; valid: boolean; state: PageState; problems: Problem[] }
  | Refusal;

/**
 * Saves the page's shared draft, if it is still at `version` (0 when the page had no draft).
 * A draft that keeps the page's shape is saved even when it is not yet valid, and marked so.
 */
export async function saveDraft(slug: unknown, content: unknown, version: unknown): Promise<SaveDraftResult> {
  const actor = await requireCms("edit");
  if (!actor.ok) return actor;
  const args = z.tuple([slugArg, z.unknown(), versionArg]).safeParse([slug, content, version]);
  if (!args.success) return { ok: false, reason: "invalid", message: "The request was not understood." };
  const [page, , from] = args.data;

  const current = await loadCmsPage(page);
  if (!current) return { ok: false, reason: "not_found", message: "There is no such page." };
  const draft = parseDraft(page, content);
  if (!draft.ok) return { ok: false, reason: "invalid", message: draft.message };

  const valid = isValidDraft(page, draft.value);
  const saved = await writeDraft(
    {
      page,
      content: draft.value,
      // A new draft starts from the deployed file; a later save keeps the hash it started from.
      baseHash: current.draft?.baseHash ?? contentHash(current.file.text),
      valid,
      authorEmail: actor.email,
    },
    from,
  );
  if (saved === null) return { ok: false, reason: "conflict", message: CONFLICT };

  await recordAdminAction({ actorEmail: actor.email, action: "cms_draft_save", detail: { page, version: saved, valid } });
  return {
    ok: true,
    version: saved,
    valid,
    state: pageState(page, draft.value, current.file.text),
    problems: checkPage(page, draft.value),
  };
}

export type DiscardDraftResult = { ok: true } | Refusal;

/** Deletes the page's draft, if it is still at `version`, so the page is back to its live content. */
export async function discardDraft(slug: unknown, version: unknown): Promise<DiscardDraftResult> {
  const actor = await requireCms("edit");
  if (!actor.ok) return actor;
  const args = z.tuple([slugArg, versionArg]).safeParse([slug, version]);
  if (!args.success) return { ok: false, reason: "invalid", message: "The request was not understood." };
  const [page, at] = args.data;

  if (!(await deleteDraft(page, at))) return { ok: false, reason: "conflict", message: CONFLICT };
  await recordAdminAction({ actorEmail: actor.email, action: "cms_draft_discard", detail: { page, version: at } });
  return { ok: true };
}

export type PublishDraftResult =
  | { ok: false; reason: "unavailable"; message: string }
  | { ok: false; reason: "checks"; message: string; problems: Problem[] }
  | { ok: false; reason: "nothing"; message: string }
  | Refusal;

/**
 * Publishes the page's draft at `version`. Publishing itself is not built yet: this checks the
 * permission, that the draft is the one the editor saw, and the publish checks, then says so.
 */
export async function publishDraft(slug: unknown, version: unknown): Promise<PublishDraftResult> {
  const actor = await requireCms("publish");
  if (!actor.ok) return actor;
  const args = z.tuple([slugArg, versionArg]).safeParse([slug, version]);
  if (!args.success) return { ok: false, reason: "invalid", message: "The request was not understood." };
  const [page, at] = args.data;

  const current = await loadCmsPage(page);
  if (!current) return { ok: false, reason: "not_found", message: "There is no such page." };
  if (current.version !== at) return { ok: false, reason: "conflict", message: CONFLICT };
  if (current.state === "live") return { ok: false, reason: "nothing", message: "There are no changes to publish." };

  const problems = checkPage(page, current.content);
  await recordAdminAction({
    actorEmail: actor.email,
    action: "cms_publish",
    detail: { page, version: at, outcome: problems.length ? "checks_failed" : "not_available" },
  });
  if (problems.length) {
    return { ok: false, reason: "checks", message: "Fix the problems listed before publishing.", problems };
  }
  return { ok: false, reason: "unavailable", message: "Publishing is not available yet. Your draft is saved." };
}
