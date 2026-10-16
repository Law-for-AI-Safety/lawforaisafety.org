import { gitHubClientFor, type GitHubClient } from "@/cms/github";
import { gitHubSetup } from "@/cms/github-config";
import { isStaleLock, readOutcome } from "@/cms/publish";
import { editorState, isDeployed, type EditorState } from "@/cms/publish-status";
import { recordAdminAction } from "@/lib/audit-log";
import type { CmsPage } from "@/lib/cms-pages";
import { deleteMergedDraft, getDraft, latestSubmission, unlockDraft, updateSubmission, type SubmissionRow } from "@/lib/cms-store";

/**
 * Where a page stands with publishing, kept in step with GitHub. There is no polling: the
 * editor page calls `refreshPublishing` when it loads, which asks GitHub about the page's open
 * pull request (if it has one) and records what became of it:
 *
 * - merged: the submission is recorded as merged. The draft stays locked until this
 *   deployment serves the merged file (`isDeployed`), then the draft that was sent is deleted,
 *   so the page starts again from the new live file. Until then the page shows as Publishing.
 * - closed without merging: recorded with the reviewer's last comment, and the draft unlocked.
 *
 * Every change is conditional in SQL on the state this load read, so two loads, or a load and
 * a publish, cannot undo each other's work. A lock whose publish stopped half way is dealt with
 * once it is older than `STALE_LOCK_MS`, by when that publish cannot still be running: a
 * pending submission whose pull request was opened is recorded as open, any other is marked
 * failed (its branch deleted) and the draft unlocked.
 */

/** The GitHub client for this site, or null when publishing is not set up. */
export function cmsGitHub(): GitHubClient | null {
  const setup = gitHubSetup();
  return setup.ok ? gitHubClientFor(setup.config) : null;
}

export type RefreshResult = { checked: boolean };

export async function refreshPublishing(slug: string, fileHash: string, viewerEmail: string): Promise<RefreshResult> {
  const outcome = (detail: Record<string, unknown>) =>
    recordAdminAction({ actorEmail: viewerEmail, action: "cms_publish_outcome", detail: { page: slug, ...detail } });
  let latest = await latestSubmission(slug);

  if (latest?.state === "open" && latest.prNumber !== null) {
    const github = cmsGitHub();
    try {
      if (!github) throw new Error("Publishing is not set up");
      const result = await readOutcome(github, latest.prNumber, slug);
      if (result.state === "merged") {
        if (!(await updateSubmission(latest.id, "open", { state: "merged", resolvedAt: result.at, mergedHash: result.mergedHash }))) return { checked: true };
        await outcome({ number: latest.prNumber, outcome: "merged" });
      } else if (result.state === "closed") {
        const recorded = await updateSubmission(latest.id, "open", {
          state: "closed",
          resolvedAt: result.at,
          closingNote: result.comment?.body ?? null,
          closingNoteBy: result.comment?.author ?? null,
        });
        if (!recorded) return { checked: true };
        await unlockDraft(slug);
        await outcome({ number: latest.prNumber, outcome: "closed" });
      }
    } catch (e) {
      console.error(`[cms] Could not read the publishing status of "${slug}"`, e);
      return { checked: false };
    }
    latest = await latestSubmission(slug);
  }

  const draft = await getDraft(slug);
  const lockedAt = draft?.lockedAt;
  if (!draft || !lockedAt) return { checked: true };
  const stale = isStaleLock(lockedAt, new Date());

  if (latest?.state === "open") return { checked: true };
  if (latest?.state === "pending") {
    if (stale) return settleAbandoned(slug, latest, lockedAt, outcome);
    return { checked: true };
  }
  if (latest?.state === "merged" && lockedAt <= latest.submittedAt) {
    if (isDeployed({ deployedHash: fileHash, baseHash: latest.baseHash ?? "", mergedHash: latest.mergedHash })) {
      await deleteMergedDraft(slug, { baseHash: latest.baseHash ?? "", draftVersion: latest.draftVersion ?? -1, submittedAt: latest.submittedAt });
    }
    return { checked: true };
  }
  // A lock no submission accounts for: a publish stopped before it recorded anything.
  if (stale && (await unlockDraft(slug, lockedAt))) await outcome({ outcome: "stale_lock_released" });
  return { checked: true };
}

/**
 * A pending submission whose publish stopped: if its pull request was opened, records it as
 * open (the page stays Publishing); otherwise deletes its branch, marks it failed and unlocks.
 */
async function settleAbandoned(
  slug: string,
  latest: SubmissionRow,
  lockedAt: Date,
  outcome: (detail: Record<string, unknown>) => Promise<void>,
): Promise<RefreshResult> {
  const github = cmsGitHub();
  let leftBranch: string | null = null;
  try {
    if (latest.branch) {
      if (!github) throw new Error("Publishing is not set up");
      const number = await github.findPullRequest(latest.branch);
      if (number !== null) {
        if (await updateSubmission(latest.id, "pending", { state: "open", prNumber: number })) await outcome({ number, outcome: "recovered" });
        return { checked: true };
      }
      try {
        await github.deleteBranch(latest.branch);
      } catch {
        leftBranch = latest.branch;
      }
    }
  } catch (e) {
    console.error(`[cms] Could not settle the unfinished publish of "${slug}"`, e);
    return { checked: false };
  }
  if (!(await updateSubmission(latest.id, "pending", { state: "failed", resolvedAt: new Date() }))) return { checked: true };
  await unlockDraft(slug, lockedAt);
  await outcome({ outcome: "stale_lock_released", ...(leftBranch ? { cleanup: "failed", leftBranch } : {}) });
  return { checked: true };
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
  const current = state === "publishing" && latest && (latest.state === "pending" || latest.state === "open" || latest.state === "merged") ? latest : null;
  return {
    state,
    sent: current && { at: current.submittedAt, by: current.submittedBy },
    approved: current?.state === "merged",
    note: state === "not_published" && latest?.closingNote ? { by: latest.closingNoteBy, text: latest.closingNote } : null,
  };
}
