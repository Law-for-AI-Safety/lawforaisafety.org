import { gitHubClientFor, type GitHubClient } from "@/cms/github";
import { gitHubSetup } from "@/cms/github-config";
import { readOutcome } from "@/cms/publish";
import { editorState, isDeployed, isStaleLock, type EditorState } from "@/cms/publish-status";
import { recordAdminAction } from "@/lib/audit-log";
import type { CmsPage } from "@/lib/cms-pages";
import { deleteLockedDraft, getDraft, latestSubmission, unlockDraft, updateSubmission, type SubmissionRow } from "@/lib/cms-store";

/**
 * Where a page stands with publishing, kept in step with GitHub. There is no polling: the
 * editor page calls `refreshPublishing` when it loads, which asks GitHub about the page's open
 * pull request (if it has one) and records what became of it:
 *
 * - merged: the submission is recorded as merged. The draft stays locked until this
 *   deployment serves the merged file (`isDeployed`), then it is deleted, so the page starts
 *   again from the new live file. Until then the page shows as Publishing.
 * - closed without merging: recorded with the reviewer's last comment, and the draft unlocked.
 *
 * A lock left by a publish that stopped half way (no submission recorded) is released once it
 * is older than `STALE_LOCK_MS`.
 */

/** The GitHub client for this site, or null when publishing is not set up. */
export function cmsGitHub(): GitHubClient | null {
  const setup = gitHubSetup();
  return setup.ok ? gitHubClientFor(setup.config) : null;
}

export type RefreshResult = { checked: boolean };

export async function refreshPublishing(slug: string, fileHash: string, viewerEmail: string): Promise<RefreshResult> {
  let latest = await latestSubmission(slug);
  let checked = true;

  if (latest?.state === "open") {
    const github = cmsGitHub();
    try {
      if (!github) throw new Error("Publishing is not set up");
      const outcome = await readOutcome(github, latest.prNumber, slug);
      if (outcome.state === "merged") {
        await updateSubmission(latest.id, "open", { state: "merged", resolvedAt: outcome.at, mergedHash: outcome.mergedHash });
        await recordAdminAction({ actorEmail: viewerEmail, action: "cms_publish_outcome", detail: { page: slug, number: latest.prNumber, outcome: "merged" } });
      } else if (outcome.state === "closed") {
        await updateSubmission(latest.id, "open", {
          state: "closed",
          resolvedAt: outcome.at,
          closingNote: outcome.comment?.body ?? null,
          closingNoteBy: outcome.comment?.author ?? null,
        });
        await unlockDraft(slug);
        await recordAdminAction({ actorEmail: viewerEmail, action: "cms_publish_outcome", detail: { page: slug, number: latest.prNumber, outcome: "closed" } });
      }
    } catch (e) {
      console.error(`[cms] Could not read the publishing status of "${slug}"`, e);
      checked = false;
    }
    latest = await latestSubmission(slug);
  }

  const draft = await getDraft(slug);
  if (!draft?.lockedAt) return { checked };
  if (latest?.state === "merged") {
    if (isDeployed({ deployedHash: fileHash, baseHash: latest.baseHash ?? "", mergedHash: latest.mergedHash })) await deleteLockedDraft(slug);
  } else if (latest?.state !== "open" && isStaleLock(draft.lockedAt, new Date())) {
    await unlockDraft(slug);
    await recordAdminAction({ actorEmail: viewerEmail, action: "cms_publish_outcome", detail: { page: slug, outcome: "stale_lock_released" } });
  }
  return { checked };
}

export type PublishingView = {
  /** When the changes being published were sent, and by whom (while Publishing). */
  sent: { at: Date; by: string } | null;
  /** Approved and merged, waiting for the site to deploy (while Publishing). */
  approved: boolean;
  /** The reviewer's last comment (while Not published). */
  note: { by: string | null; text: string } | null;
};

export function publishingView(page: CmsPage, latest: SubmissionRow | null): PublishingView & { state: EditorState } {
  const state = editorState({
    pageState: page.state,
    locked: Boolean(page.draft?.lockedAt),
    draftVersion: page.version,
    latest: latest && { state: latest.state, draftVersion: latest.draftVersion ?? -1 },
  });
  const current = state === "publishing" && latest && (latest.state === "open" || latest.state === "merged") ? latest : null;
  return {
    state,
    sent: current && { at: current.submittedAt, by: current.submittedBy },
    approved: current?.state === "merged",
    note: state === "not_published" && latest?.closingNote ? { by: latest.closingNoteBy, text: latest.closingNote } : null,
  };
}
