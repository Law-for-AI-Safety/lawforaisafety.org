"use server";

import { z } from "zod";
import { contentHash, contentRoutes, contentSlugs } from "@/cms/content-files";
import { isValidDraft, pageState, parseDraft, type PageState } from "@/cms/drafts";
import type { FieldChange } from "@/cms/field-diff";
import { publishToGitHub, withdrawFromGitHub } from "@/cms/publish";
import type { Problem } from "@/cms/publish-checks";
import { recordAdminAction } from "@/lib/audit-log";
import { recordDraftEdit } from "@/lib/cms-audit";
import { requireCms } from "@/lib/cms-access";
import { checkPage, cmsDirs, loadCmsPage } from "@/lib/cms-pages";
import { cmsGitHub } from "@/lib/cms-publishing";
import { deleteDraft, insertSubmission, latestSubmission, lockDraft, unlockDraft, updateSubmission, writeDraft } from "@/lib/cms-store";

/**
 * The CMS editor's server actions. Each is a public endpoint: it checks the caller's
 * permission itself (`requireCms`, read from the database on every call) and validates every
 * argument, whatever the editor UI shows.
 */

const slugArg = z.string().max(100);
const versionArg = z.number().int().min(0).max(2_147_483_647);

const CONFLICT =
  "Someone else changed this page since you opened it. Reload the page to see their changes; edits you made since then were not saved.";

const LOCKED =
  "This page has been sent for publishing, so it can't be changed until that is finished. To change it now, withdraw it first.";

type Refusal = { ok: false; reason: "signed_out" | "forbidden" | "invalid" | "conflict" | "not_found" | "locked"; message: string };

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
  if (current.draft?.lockedAt) return { ok: false, reason: "locked", message: LOCKED };
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

  await recordDraftEdit({ actorEmail: actor.email, page, version: saved, valid });
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

  const current = await loadCmsPage(page);
  if (current?.draft?.lockedAt) return { ok: false, reason: "locked", message: LOCKED };
  if (!(await deleteDraft(page, at))) return { ok: false, reason: "conflict", message: CONFLICT };
  await recordAdminAction({ actorEmail: actor.email, action: "cms_draft_discard", detail: { page, version: at } });
  return { ok: true };
}

export type PublishDraftResult =
  | { ok: true; message: string }
  | { ok: false; reason: "unavailable" | "nothing" | "failed"; message: string }
  | { ok: false; reason: "checks"; message: string; problems: Problem[] }
  | { ok: false; reason: "stale"; message: string; changes: FieldChange[] }
  | Refusal;

const NOT_SET_UP = "Publishing is not set up on this site yet. Your draft is saved.";
const FAILED = "Publishing did not work this time, and nothing was sent. Your draft is saved; try again in a few minutes.";
const STALE =
  "The live page was changed by someone else since this draft was started, in the places listed below. Publishing this draft would undo those changes, so it was not sent. Copy your changes somewhere, discard the draft, and make them again on the current page.";

/**
 * Sends the page's draft at `version` for publishing. Checks the permission, that the draft is
 * the one the editor saw and not already sent, and the publish checks; then locks the draft and
 * opens the pull request (`publishToGitHub`). Anything short of an opened and recorded pull
 * request unlocks the draft again. Every attempt is in the audit log with its outcome.
 */
export async function publishDraft(slug: unknown, version: unknown): Promise<PublishDraftResult> {
  const actor = await requireCms("publish");
  if (!actor.ok) return actor;
  const args = z.tuple([slugArg, versionArg]).safeParse([slug, version]);
  if (!args.success) return { ok: false, reason: "invalid", message: "The request was not understood." };
  const [page, at] = args.data;

  const current = await loadCmsPage(page);
  if (!current) return { ok: false, reason: "not_found", message: "There is no such page." };
  if (current.draft?.lockedAt) return { ok: false, reason: "locked", message: LOCKED };
  if (current.version !== at) return { ok: false, reason: "conflict", message: CONFLICT };
  if (current.state === "live" || !current.draft) return { ok: false, reason: "nothing", message: "There are no changes to publish." };
  const draft = current.draft;

  const audit = (detail: Record<string, unknown>) =>
    recordAdminAction({ actorEmail: actor.email, action: "cms_publish", detail: { page, version: at, ...detail } });

  const problems = checkPage(page, current.content);
  if (problems.length) {
    await audit({ outcome: "checks_failed" });
    return { ok: false, reason: "checks", message: "Fix the problems listed before publishing.", problems };
  }
  const github = cmsGitHub();
  if (!github) {
    await audit({ outcome: "not_set_up" });
    return { ok: false, reason: "unavailable", message: NOT_SET_UP };
  }
  if (!(await lockDraft(page, at))) return { ok: false, reason: "conflict", message: CONFLICT };

  // The row comes first, and gets the branch before the pull request is opened, so there is
  // never a pull request no row points to (see refreshPublishing for a publish that stops).
  let submission;
  try {
    submission = await insertSubmission({ page, state: "pending", submittedBy: actor.email, submittedAt: new Date(), baseHash: draft.baseHash, draftVersion: at });
  } catch (e) {
    await unlockDraft(page);
    throw e;
  }
  const settle = async () => {
    await updateSubmission(submission.id, "pending", { state: "failed", resolvedAt: new Date() });
    await unlockDraft(page);
  };

  let result;
  try {
    const dirs = cmsDirs();
    result = await publishToGitHub(github, {
      slug: page,
      draft: current.content,
      baseHash: draft.baseHash,
      editorName: actor.name,
      now: new Date(),
      publicDir: dirs.publicDir,
      routes: contentRoutes(dirs, contentSlugs(dirs.contentDir)),
      recordBranch: async (branch) => {
        if (!(await updateSubmission(submission.id, "pending", { branch }))) throw new Error("The submission is no longer pending");
      },
    });
  } catch (e) {
    await settle();
    throw e;
  }

  if (!result.ok) {
    await settle();
    switch (result.reason) {
      case "stale":
        await audit({ outcome: "stale", fields: result.changes.map((c) => c.label) });
        return { ok: false, reason: "stale", message: STALE, changes: result.changes };
      case "checks":
        await audit({ outcome: "checks_failed", problems: result.problems });
        return { ok: false, reason: "checks", message: "Fix the problems listed before publishing.", problems: result.problems.map((message) => ({ path: [], message })) };
      case "nothing":
        await audit({ outcome: "nothing" });
        return { ok: false, reason: "nothing", message: "The live page already has these changes. There is nothing to publish." };
      case "missing":
        await audit({ outcome: "missing" });
        return { ok: false, reason: "failed", message: "This page is not on the live site any more, so it cannot be published. Ask a developer." };
      case "record":
      case "github": {
        const step = result.reason === "record" ? "record" : result.step;
        const error = result.reason === "record" ? String(result.error) : result.message;
        if (result.leftBranch) console.error(`[cms] Publishing "${page}" failed and its branch ${result.leftBranch} could not be deleted`);
        await audit({ outcome: "failed", step, error, ...(result.leftBranch ? { cleanup: "failed", leftBranch: result.leftBranch } : {}) });
        return { ok: false, reason: "failed", message: FAILED };
      }
    }
  }

  let recorded = false;
  try {
    recorded = await updateSubmission(submission.id, "pending", { state: "open", prNumber: result.number });
  } catch (e) {
    console.error(`[cms] Could not record the pull request of "${page}"`, e);
  }
  if (!recorded) {
    // Without its number the page could never leave Publishing, so the request is taken back.
    const undone = await withdrawFromGitHub(github, result.number, result.branch);
    await settle();
    await audit({ outcome: "failed", step: "record", number: result.number, cleanup: undone.ok && !undone.leftBranch ? "done" : "failed" });
    return { ok: false, reason: "failed", message: FAILED };
  }
  await audit({ outcome: "sent", number: result.number, branch: result.branch, ...(result.bodyUpdated ? {} : { previewLink: "not_added" }) });
  return { ok: true, message: "Sent for publishing. The page goes live once it is approved." };
}

export type WithdrawResult = { ok: true } | { ok: false; reason: "unavailable" | "failed" | "not_publishing"; message: string } | Refusal;

/**
 * Takes back a page sent for publishing: closes its pull request, deletes its branch, and
 * unlocks the draft. Needs the publish permission, like sending it.
 */
export async function withdrawPublish(slug: unknown): Promise<WithdrawResult> {
  const actor = await requireCms("publish");
  if (!actor.ok) return actor;
  const args = slugArg.safeParse(slug);
  if (!args.success) return { ok: false, reason: "invalid", message: "The request was not understood." };
  const page = args.data;

  const latest = await latestSubmission(page);
  if (latest?.state !== "open" || latest.prNumber === null || latest.branch === null) {
    return { ok: false, reason: "not_publishing", message: "This page is not waiting to be published. Reload the page to see where it stands." };
  }
  const github = cmsGitHub();
  if (!github) return { ok: false, reason: "unavailable", message: NOT_SET_UP };

  const result = await withdrawFromGitHub(github, latest.prNumber, latest.branch);
  if (!result.ok) {
    await recordAdminAction({ actorEmail: actor.email, action: "cms_withdraw", detail: { page, number: latest.prNumber, outcome: result.reason } });
    return result.reason === "merged"
      ? { ok: false, reason: "not_publishing", message: "This page has just been approved, so it can no longer be withdrawn. Reload the page to see where it stands." }
      : { ok: false, reason: "failed", message: "Withdrawing did not work this time. Try again in a few minutes." };
  }
  await updateSubmission(latest.id, "open", { state: "withdrawn", resolvedAt: new Date() });
  await unlockDraft(page);
  if (result.leftBranch) console.error(`[cms] Withdrew "${page}" but could not delete its branch ${result.leftBranch}`);
  await recordAdminAction({
    actorEmail: actor.email,
    action: "cms_withdraw",
    detail: { page, number: latest.prNumber, outcome: "withdrawn", ...(result.leftBranch ? { cleanup: "failed", leftBranch: result.leftBranch } : {}) },
  });
  return { ok: true };
}
