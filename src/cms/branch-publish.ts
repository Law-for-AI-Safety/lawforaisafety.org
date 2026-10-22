import { GitHubError, type GitHubClient } from "./github";

/**
 * Small, schema-agnostic pieces shared by every "publish via pull request" flow in this repo -
 * today `src/cms/publish.ts` (content pages) and `src/opportunities/github-publish.ts`
 * (opportunities). None of this knows what's being published; each caller supplies its own
 * branch prefix and file path.
 */

/** A date as YYYY-MM-DD, in UTC. */
export function isoDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** A branch name like `<prefix>/<slug>-<YYYY-MM-DD>`, with `-2`, `-3`, ... when attempt > 1. */
export function branchName(prefix: string, slug: string, at: Date, attempt = 1): string {
  return `${prefix}/${slug}-${isoDay(at)}${attempt > 1 ? `-${attempt}` : ""}`;
}

/** Text in a markdown code span that nothing inside can close, on one line. */
export function codeSpan(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const longest = Math.max(0, ...(flat.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  const pad = flat.startsWith("`") || flat.endsWith("`") ? " " : "";
  return `${fence}${pad}${flat}${pad}${fence}`;
}

/** Deletes a branch; returns its name if that failed, else null. */
export async function deleteOrKeep(github: GitHubClient, branch: string): Promise<string | null> {
  try {
    await github.deleteBranch(branch);
    return null;
  } catch {
    return branch;
  }
}

/** A step at which a publish-style action can fail against GitHub. */
export type GitHubFailure<Step extends string> = {
  ok: false;
  reason: "github";
  step: Step;
  message: string;
  leftBranch: string | null;
};

/** Turns a caught error into a `GitHubFailure`; rethrows anything that isn't a `GitHubError`. */
export function githubFailure<Step extends string>(step: Step, e: unknown, leftBranch: string | null = null): GitHubFailure<Step> {
  if (!(e instanceof GitHubError)) throw e;
  return { ok: false, reason: "github", step, message: e.message, leftBranch };
}
