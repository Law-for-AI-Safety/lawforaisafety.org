import { and, desc, eq, sql } from "drizzle-orm";
import { adminAuditLog } from "@/drizzle/schema";
import { GitHubAppClient, GitHubError, gitHubClientFor, type GitHubClient } from "@/cms/github";
import { gitHubSetup, MAIN_BRANCH } from "@/cms/github-config";
import { describeKey, readPrivateKey } from "@/cms/private-key";
import { db } from "@/lib/db";
import { isStaleLock, readOutcome } from "@/cms/publish";
import { pagePath } from "@/cms/pages";
import { editorState, isDeployed, type EditorState } from "@/cms/publish-status";
import { recordAdminAction } from "@/lib/audit-log";
import type { CmsPage } from "@/lib/cms-pages";
import { notifyIndexNowLater } from "@/lib/indexnow";
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
 *
 * The load that deletes the merged draft, the page now being live, also tells the search
 * engines about it (IndexNow).
 */

/** The GitHub client for this site, or null when publishing is not set up. */
export function cmsGitHub(): GitHubClient | null {
  const setup = gitHubSetup();
  return setup.ok ? gitHubClientFor(setup.config) : null;
}

/** Why publishing is not set up (which settings are missing), or null when it is. */
export function gitHubSetupProblem(): string | null {
  const setup = gitHubSetup();
  return setup.ok ? null : setup.problem;
}

export type PublishingHealth = {
  /** Whether the GitHub App's settings are all present and its key can be read. */
  settings: { ok: true; key: string; repo: string } | { ok: false; problem: string };
  /** The most recent publish that failed for a reason other than the page itself. */
  lastFailure: { at: Date; page: string; step: string | null; error: string; setup: boolean } | null;
  /** When a page was last sent for publishing. */
  lastSent: Date | null;
};

/**
 * Where publishing stands, for technical admins: the settings, read without calling GitHub,
 * and the last failed and last successful publish from the audit log. Errors in the audit log
 * were written by this code and never quote the key.
 */
export async function publishingHealth(): Promise<PublishingHealth> {
  const setup = gitHubSetup();
  let settings: PublishingHealth["settings"];
  if (!setup.ok) settings = { ok: false, problem: setup.problem };
  else {
    const key = readPrivateKey(setup.config.privateKey);
    settings = key.ok ? { ok: true, key: describeKey(key), repo: `${setup.config.owner}/${setup.config.repo}` } : { ok: false, problem: key.problem };
  }

  const outcome = sql<string>`${adminAuditLog.detail}->>'outcome'`;
  const latest = (outcomes: string[]) =>
    db
      .select({ at: adminAuditLog.at, detail: adminAuditLog.detail })
      .from(adminAuditLog)
      .where(and(eq(adminAuditLog.action, "cms_publish"), sql`${outcome} in (${sql.join(outcomes.map((o) => sql`${o}`), sql`, `)})`))
      .orderBy(desc(adminAuditLog.at))
      .limit(1);
  const [[failed], [sent]] = await Promise.all([latest(["failed", "not_set_up"]), latest(["sent"])]);

  let lastFailure: PublishingHealth["lastFailure"] = null;
  if (failed) {
    const detail = failed.detail as Record<string, unknown>;
    const notSetUp = detail.outcome === "not_set_up";
    lastFailure = {
      at: failed.at,
      page: String(detail.page),
      step: typeof detail.step === "string" ? detail.step : null,
      error: typeof detail.error === "string" ? detail.error : notSetUp ? "Publishing is not set up" : "No error was recorded",
      // Failures recorded before setup problems were told apart are judged by their error.
      setup: notSetUp || detail.setup === true || (typeof detail.error === "string" && detail.error.startsWith("GITHUB_APP_PRIVATE_KEY")),
    };
  }
  return { settings, lastFailure, lastSent: sent?.at ?? null };
}

export type ConnectionCheck = { ok: true; message: string } | { ok: false; message: string; setup: boolean };

/**
 * Signs in as the App afresh and reads the head of main, changing nothing: what a publish
 * does first. A new client is used, so a token cached by an earlier publish cannot hide a
 * key that no longer works.
 */
export async function checkGitHubConnection(): Promise<ConnectionCheck> {
  const setup = gitHubSetup();
  if (!setup.ok) return { ok: false, message: setup.problem, setup: true };
  const { owner, repo } = setup.config;
  try {
    const head = await new GitHubAppClient(setup.config).branchHead(MAIN_BRANCH);
    if (!head) {
      return { ok: false, message: `The App can't see the ${MAIN_BRANCH} branch of ${owner}/${repo}. Check that it is installed on that repo.`, setup: true };
    }
    return { ok: true, message: `Connected to ${owner}/${repo}: ${MAIN_BRANCH} is at ${head.commit.slice(0, 7)}.` };
  } catch (e) {
    if (!(e instanceof GitHubError)) throw e;
    return { ok: false, message: e.message, setup: e.setup };
  }
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
      const sent = { baseHash: latest.baseHash ?? "", draftVersion: latest.draftVersion ?? -1, submittedAt: latest.submittedAt };
      if (await deleteMergedDraft(slug, sent)) notifyIndexNowLater([pagePath(slug)]);
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
