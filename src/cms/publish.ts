import { checkContentText, printContent } from "./content-files";
import { changedFields, type FieldChange } from "./field-diff";
import { GitHubError, type GitHubClient, type PullRequest, type PullRequestComment } from "./github";
import { MAIN_BRANCH, previewUrl } from "./github-config";
import { pagePath } from "./pages";
import type { Route } from "./routes";
import { pageSchema } from "./schema";

/**
 * Publishing a page: turning its draft into a pull request against `main` that changes only
 * the page's content file, and reading back what became of it. The caller (the publish server
 * action) has already checked the person's permission and the publish checks, and holds the
 * page's lock; this does the GitHub part and leaves nothing half done:
 *
 * 1. The file on `main` must still be the one the draft started from (same blob id), or the
 *    publish is refused with the fields that changed on the live page.
 * 2. The file is regenerated with the canonical formatter, `updatedAt` set to today, and the
 *    exact text to be committed is checked with `checkContentText`.
 * 3. A commit changing that one file is made on top of `main` (Git Data API), and only then a
 *    branch `cms/<page>-<YYYY-MM-DD>` (with `-2`, `-3`... when taken) pointing at it.
 * 4. The pull request is opened. If that fails the branch is deleted again; if deleting fails
 *    too, the result says which branch was left behind.
 * 5. The body is updated with the deploy preview link, once the number is known. If that
 *    fails the pull request stays (it is complete without the link) and the result says so.
 *
 * After step 4 nothing is pushed to the branch again: a reviewer may add their own commits.
 */

export const CONTENT_DIR = "content";
const MAX_BRANCH_ATTEMPTS = 20;

export function contentFilePath(slug: string): string {
  return `${CONTENT_DIR}/${slug}.json`;
}

/** A date as YYYY-MM-DD, in UTC. */
export function isoDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export function branchName(slug: string, at: Date, attempt = 1): string {
  return `cms/${slug}-${isoDay(at)}${attempt > 1 ? `-${attempt}` : ""}`;
}

/** Text in a markdown code span that nothing inside can close, on one line. */
function code(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const longest = Math.max(0, ...(flat.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  const pad = flat.startsWith("`") || flat.endsWith("`") ? " " : "";
  return `${fence}${pad}${flat}${pad}${fence}`;
}

/** Text in a fenced block that nothing inside can close, so editor text is never read as markdown. */
function fenced(text: string): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  return `${fence}text\n${text}\n${fence}`;
}

/**
 * What the body says about the publish checks. A page is only sent when they all pass on the
 * exact text committed, so there is never a failure to report; CI runs them again.
 */
export const PASSED_CHECKS =
  "all passed on the committed file: fields valid, canonical formatting, every site link leads to a page, every image exists, one main heading.";

export function pullRequestTitle(pageTitle: string): string {
  return `Website edit: update the ${pageTitle.replace(/\s+/g, " ").trim()} page`;
}

export function commitMessage(pageTitle: string, editorName: string): string {
  return `${pullRequestTitle(pageTitle)}\n\nSent from the website editor by ${editorName.replace(/\s+/g, " ").trim()}.`;
}

export type PullRequestBodyInput = {
  slug: string;
  editorName: string;
  changes: FieldChange[];
  /** The pull request's number, once known, for the deploy preview link. */
  number: number | null;
};

/**
 * The pull request description: written for a reviewer who is checking safety and layout,
 * not judging the wording. Text from the editor (field values, their name) is fenced or in
 * code spans, so it cannot mention people, embed images or add links.
 */
export function pullRequestBody({ slug, editorName, changes, number }: PullRequestBodyInput): string {
  const path = pagePath(slug);
  const preview = number === null ? "The preview link is added here once this pull request has a number." : previewUrl(number, path);
  const lines = [
    `An editor sent changes to the page at ${code(path)} from the website editor. This pull request changes only ${code(contentFilePath(slug))}.`,
    "",
    `- **Sent by:** ${code(editorName)}`,
    `- **Deploy preview:** ${preview}`,
    `- **Publish checks:** ${PASSED_CHECKS}`,
    "",
    `## Changes (${changes.length})`,
    "",
  ];
  for (const change of changes) {
    lines.push(`### ${change.label}`, "", "Before:", "", fenced(change.before), "", "After:", "", fenced(change.after), "");
  }
  lines.push(
    "---",
    "",
    "Merging this makes the change live. To decline it, close this pull request with a comment: the editor sees the last comment. You may push your own commits to this branch first; the website editor never pushes to it again.",
  );
  return `${lines.join("\n")}\n`;
}

export type PublishInput = {
  slug: string;
  /** The draft's content; the caller has checked it passes the publish checks. */
  draft: unknown;
  /** The blob id of the content file the draft started from. */
  baseHash: string;
  editorName: string;
  now: Date;
  /** What `checkContentText` checks the committed text against. */
  publicDir: string;
  routes: Route[];
};

export type PublishStep = "read_main" | "commit" | "branch" | "open";

export type PublishResult =
  | {
      ok: true;
      number: number;
      url: string;
      branch: string;
      previewUrl: string;
      changes: FieldChange[];
      /** False when the preview link could not be added to the body. */
      bodyUpdated: boolean;
    }
  | { ok: false; reason: "stale"; changes: FieldChange[]; exact: boolean }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "checks"; problems: string[] }
  | { ok: false; reason: "nothing" }
  | { ok: false; reason: "github"; step: PublishStep; message: string; leftBranch: string | null };

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function failure(step: PublishStep, e: unknown, leftBranch: string | null = null): PublishResult {
  if (!(e instanceof GitHubError)) throw e;
  return { ok: false, reason: "github", step, message: e.message, leftBranch };
}

export async function publishToGitHub(github: GitHubClient, input: PublishInput): Promise<PublishResult> {
  const { slug, draft, baseHash, editorName, now } = input;
  const path = contentFilePath(slug);

  // 1. The live file must be the one the draft started from.
  let head: { commit: string; tree: string };
  let main;
  try {
    const found = await github.branchHead(MAIN_BRANCH);
    if (!found) throw new GitHubError(404, `The ${MAIN_BRANCH} branch was not found`);
    head = found;
    main = await github.readFile(path, head.commit);
    if (!main) return { ok: false, reason: "missing" };
    if (main.sha !== baseHash) {
      const base = await github.readBlob(baseHash);
      const mainValue = parseJson(main.text);
      return base === null
        ? { ok: false, reason: "stale", changes: changedFields(draft, mainValue), exact: false }
        : { ok: false, reason: "stale", changes: changedFields(parseJson(base), mainValue), exact: true };
    }
  } catch (e) {
    return failure("read_main", e);
  }

  // 2. The exact text to commit, formatted and checked.
  const parsed = pageSchema(slug).safeParse({ ...(draft as object), updatedAt: isoDay(now) });
  if (!parsed.success) return { ok: false, reason: "checks", problems: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const text = printContent(parsed.data);
  const problems = checkContentText(slug, text, input.publicDir, input.routes);
  if (problems.length) return { ok: false, reason: "checks", problems };
  const changes = changedFields(parseJson(main.text), parsed.data);
  if (changes.length === 0) return { ok: false, reason: "nothing" };
  const title = parsed.data.title;

  // 3. The commit, then the branch pointing at it.
  let commit: string;
  try {
    commit = await github.createCommit({ parent: head.commit, baseTree: head.tree, path, text, message: commitMessage(title, editorName) });
  } catch (e) {
    return failure("commit", e);
  }
  let branch: string | null = null;
  try {
    for (let attempt = 1; attempt <= MAX_BRANCH_ATTEMPTS && branch === null; attempt++) {
      const name = branchName(slug, now, attempt);
      if (await github.createBranch(name, commit)) branch = name;
    }
    if (branch === null) throw new GitHubError(422, `Every branch name up to ${branchName(slug, now, MAX_BRANCH_ATTEMPTS)} is taken`);
  } catch (e) {
    return failure("branch", e);
  }

  // 4. The pull request, or no branch.
  const body = (number: number | null) => pullRequestBody({ slug, editorName, changes, number });
  let opened: { number: number; url: string };
  try {
    opened = await github.openPullRequest({ head: branch, base: MAIN_BRANCH, title: pullRequestTitle(title), body: body(null) });
  } catch (e) {
    let left: string | null = null;
    try {
      await github.deleteBranch(branch);
    } catch {
      left = branch;
    }
    return failure("open", e, left);
  }

  // 5. The preview link, now the number is known.
  let bodyUpdated = true;
  try {
    await github.updatePullRequestBody(opened.number, body(opened.number));
  } catch (e) {
    if (!(e instanceof GitHubError)) throw e;
    bodyUpdated = false;
  }
  return { ok: true, number: opened.number, url: opened.url, branch, previewUrl: previewUrl(opened.number, pagePath(slug)), changes, bodyUpdated };
}

export type WithdrawResult =
  | { ok: true; leftBranch: string | null }
  | { ok: false; reason: "merged" }
  | { ok: false; reason: "github"; message: string };

/**
 * Withdraws a page sent for publishing: closes its pull request, then deletes its branch. A
 * pull request that was merged meanwhile cannot be withdrawn. If the branch cannot be deleted
 * once the pull request is closed, the withdrawal still stands and the result names the branch.
 */
export async function withdrawFromGitHub(github: GitHubClient, number: number, branch: string): Promise<WithdrawResult> {
  try {
    const pr = await github.getPullRequest(number);
    if (pr.merged) return { ok: false, reason: "merged" };
    if (pr.state === "open") await github.closePullRequest(number);
  } catch (e) {
    if (!(e instanceof GitHubError)) throw e;
    return { ok: false, reason: "github", message: e.message };
  }
  try {
    await github.deleteBranch(branch);
    return { ok: true, leftBranch: null };
  } catch (e) {
    if (!(e instanceof GitHubError)) throw e;
    return { ok: true, leftBranch: branch };
  }
}

export type PullRequestOutcome =
  | { state: "open" }
  | { state: "merged"; at: Date; mergedHash: string | null }
  | { state: "closed"; at: Date; comment: PullRequestComment | null };

/** What became of a page's pull request, with what the editor is shown about it. */
export async function readOutcome(github: GitHubClient, number: number, slug: string): Promise<PullRequestOutcome> {
  const pr: PullRequest = await github.getPullRequest(number);
  if (pr.merged) {
    const merged = pr.mergeCommitSha ? await github.readFile(contentFilePath(slug), pr.mergeCommitSha) : null;
    return { state: "merged", at: pr.mergedAt ?? new Date(), mergedHash: merged?.sha ?? null };
  }
  if (pr.state === "open") return { state: "open" };
  return { state: "closed", at: pr.closedAt ?? new Date(), comment: await github.lastComment(number) };
}
