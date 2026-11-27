/**
 * The CMS auto-merge, run by .github/workflows/cms-auto-merge.yml. A pull request the website
 * editor opens merges itself, once the required checks pass, when it is provably nothing but
 * one page's content:
 *
 * - opened by the CMS App's bot (CMS_BOT_LOGIN), open and not a draft;
 * - from a `cms/<page>-<YYYY-MM-DD>` branch (optional `-N`) in this repository, into `main`;
 * - every commit authored and committed by the bot, signed by GitHub, and not a merge;
 * - exactly one file changed, `content/<page>.json` for the page in the branch name, modified
 *   (not added, removed or renamed);
 * - no maintainer has stepped in: it was never closed (a declined pull request that is
 *   reopened is theirs), and nobody but this workflow turned its auto-merge on or off or
 *   dismissed a review on it.
 *
 * Anything else is left for a maintainer, and whatever this script did on the pull request
 * before (its approvals, the auto-merge it enabled) is taken back: a maintainer's push makes
 * the pull request theirs to merge.
 *
 * Everything is read through the GitHub API; nothing from the pull request is checked out or
 * run. The workflow runs main's copy of this script.
 *
 * Modes (first argument):
 * - `check`: read only. Writes `eligible` and `head_sha` to GITHUB_OUTPUT.
 * - `merge`: reads again, and if still eligible at the head `check` saw (HEAD_SHA), approves
 *   that head, enables auto-merge (merge commit) for that head only, and comments once. If
 *   the checks have already passed, GitHub refuses auto-merge, so it merges that head now. If it
 *   is no longer eligible, it takes back instead.
 * - `withdraw`: takes back its own approvals and its own auto-merge.
 *
 * Settings (environment): CMS_BOT_LOGIN, GITHUB_REPOSITORY, GITHUB_API_URL, GITHUB_TOKEN,
 * PR_NUMBER, GITHUB_OUTPUT (check), HEAD_SHA (merge), NOTIFY (optional login mentioned in the
 * comment, so they hear when it merges).
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { ALLOWED_DIR, BRANCH_PREFIX, botLoginProblem, escapeCommand, isBot } from "./cms-guard.mjs";

export const MAIN = "main";
/** The login GitHub gives the workflow's own token. */
export const ACTIONS_LOGIN = "github-actions[bot]";
/** Marks the script's comment, so it is written once. */
export const MARKER = "<!-- cms-auto-merge -->";
/** One page of a list; a pull request with more is not the editor's. */
const PAGE = 100;
/** Events by which a maintainer takes a pull request over, unless this workflow caused them. */
const TAKEOVER = new Set(["auto_merge_enabled", "auto_merge_disabled", "auto_squash_enabled", "auto_rebase_enabled", "review_dismissed"]);
/** Tries per GitHub request: a transient failure must not take back a pull request that qualifies. */
export const ATTEMPTS = 3;

// The slug rule from src/cms/slugs.ts, then the date and the optional attempt from
// src/cms/branch-publish.ts (`-2`, `-3`, ... never `-1`).
const BRANCH = /^cms\/([a-z0-9]+(?:-[a-z0-9]+)*)-(\d{4}-\d{2}-\d{2})(?:-[2-9]|-[1-9]\d+)?$/;

/**
 * The page a CMS branch publishes, or null when the name is not one the editor makes.
 * @param {string} ref
 */
export function pageFromBranch(ref) {
  if (!ref.startsWith(BRANCH_PREFIX)) return null;
  return BRANCH.exec(ref)?.[1] ?? null;
}

const same = (/** @type {string | undefined | null} */ a, /** @type {string} */ b) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
const short = (/** @type {string} */ sha) => sha.slice(0, 12);

/**
 * Every reason the pull request must not merge itself; none means it may.
 * @param {{ botLogin: string, repository: string, pr: any, commits: any[], files: any[], events: any[] }} input
 * @returns {string[]}
 */
export function checkAutoMerge({ botLogin, repository, pr, commits, files, events }) {
  const login = botLogin.trim();
  const bad = botLoginProblem(login);
  if (bad) return [bad];

  const problems = [];
  if (!same(pr.user?.login, login)) problems.push(`It was opened by ${pr.user?.login}, not ${login}.`);
  if (pr.state !== "open") problems.push(`It is ${pr.state}.`);
  if (pr.draft) problems.push("It is a draft.");
  const headRepo = pr.head?.repo?.full_name;
  if (!same(headRepo, repository)) problems.push(`Its branch is in ${headRepo ?? "a deleted repository"}, not this repository.`);
  if (!same(pr.base?.repo?.full_name, repository)) problems.push(`Its base is in ${pr.base?.repo?.full_name}, not this repository.`);
  if (pr.base?.ref !== MAIN) problems.push(`It is into ${pr.base?.ref}, not ${MAIN}.`);

  const page = pageFromBranch(String(pr.head?.ref));
  if (page === null) {
    problems.push(`Its branch ${pr.head?.ref} is not ${BRANCH_PREFIX}<page>-<YYYY-MM-DD>.`);
  } else {
    const path = `${ALLOWED_DIR}${page}.json`;
    if (pr.changed_files !== files.length) {
      problems.push(`GitHub listed ${files.length} of its ${pr.changed_files} changed files, so they cannot all be checked.`);
    } else if (files.length !== 1) {
      problems.push(`It changes ${files.length} files, not only ${path}.`);
    } else if (files[0].filename !== path) {
      problems.push(`It changes ${files[0].filename}, not only ${path}.`);
    } else if (files[0].status !== "modified" || files[0].previous_filename) {
      const how = files[0].previous_filename ? `renamed from ${files[0].previous_filename}` : files[0].status;
      problems.push(`It does not only modify ${path} (${how}).`);
    }
  }

  if (pr.commits !== commits.length) {
    problems.push(`GitHub listed ${commits.length} of its ${pr.commits} commits, so they cannot all be checked.`);
  } else if (commits.length === 0) {
    problems.push("It has no commits.");
  } else {
    const last = commits[commits.length - 1].sha;
    if (last !== pr.head?.sha) problems.push(`Its last commit is ${short(last)}, not its head ${short(String(pr.head?.sha))}.`);
  }
  for (const c of commits) {
    // Both the account GitHub tied the commit to and the git identity in it must be the bot's.
    const byBot =
      same(c.author?.login, login) && same(c.committer?.login, login) && isBot(c.commit.author, login) && isBot(c.commit.committer, login);
    if (!byBot) problems.push(`Commit ${short(c.sha)} is not authored and committed by ${login}.`);
    else if (c.commit.verification?.verified !== true) problems.push(`Commit ${short(c.sha)} is not signed by GitHub.`);
    if (c.parents.length > 1) problems.push(`Commit ${short(c.sha)} is a merge commit.`);
  }

  if (events.length >= PAGE) problems.push(`It has ${events.length} or more events, so they cannot all be checked.`);
  if (events.some((e) => e.event === "closed")) problems.push("It was closed before, so a maintainer decides.");
  for (const e of events) {
    if (TAKEOVER.has(e.event) && !same(e.actor?.login, ACTIONS_LOGIN)) {
      problems.push(`${e.actor?.login ?? "Someone"} took it over (${e.event}), so they decide.`);
    }
  }
  return problems;
}

/**
 * What to do on the pull request. Eligible: approve its head, enable auto-merge, comment,
 * each only once. Not eligible: take back the script's own approvals and auto-merge, never
 * a maintainer's.
 * @param {{ eligible: boolean, pr: any, reviews: any[], comments: any[] }} input
 */
export function planActions({ eligible, pr, reviews, comments }) {
  const mine = reviews.filter((r) => same(r.user?.login, ACTIONS_LOGIN) && r.state === "APPROVED");
  const autoMergeMine = same(pr.auto_merge?.enabled_by?.login, ACTIONS_LOGIN);
  if (!eligible) {
    return { approve: false, enable: false, comment: false, dismiss: mine.map((r) => r.id), disable: autoMergeMine };
  }
  return {
    approve: !mine.some((r) => r.commit_id === pr.head.sha),
    enable: !pr.auto_merge,
    comment: !comments.some((c) => same(c.user?.login, ACTIONS_LOGIN) && String(c.body).startsWith(MARKER)),
    dismiss: [],
    disable: false,
  };
}

/**
 * The GitHub API, through `fetch` (a parameter, so tests can fake it).
 * Network failures and 5xx answers are tried again, up to ATTEMPTS times.
 * @param {Record<string, string | undefined>} env
 * @param {typeof fetch} fetchImpl
 * @param {(ms: number) => Promise<void>} wait
 */
export function createGitHub(env, fetchImpl = fetch, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  const api = env.GITHUB_API_URL ?? "https://api.github.com";
  const headers = {
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "content-type": "application/json",
  };
  /**
   * The answer and its body (parsed when it is JSON), trying again on a network failure or a
   * 5xx. @param {string} url @param {string} method @param {unknown} [body]
   * @returns {Promise<{ status: number, ok: boolean, json: any }>}
   */
  const send = async (url, method, body) => {
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await fetchImpl(url, {
          method,
          headers,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(30_000),
        });
        const text = await response.text();
        if (response.status < 500 || attempt === ATTEMPTS) {
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            // A proxy's error page, say: reported by status alone.
          }
          return { status: response.status, ok: response.ok, json };
        }
      } catch (e) {
        if (attempt === ATTEMPTS) throw e;
      }
      await wait(attempt * 2000);
    }
  };
  /** @param {string} method @param {string} route @param {unknown} [body] */
  const rest = async (method, route, body) => {
    const { status, ok, json } = await send(`${api}/repos/${env.GITHUB_REPOSITORY}${route}`, method, body);
    if (!ok || json === null) throw new Error(`${method} ${route}: ${status} ${json?.message ?? "(no JSON body)"}`);
    return json;
  };
  /** @param {string} query @param {Record<string, string>} variables */
  const graphql = async (query, variables) => {
    const { status, ok, json } = await send(`${api}/graphql`, "POST", { query, variables });
    if (!ok || !json || json.errors?.length) throw new Error(`GraphQL: ${json?.errors?.map((/** @type {any} */ e) => e.message).join("; ") ?? status}`);
    return json.data;
  };
  return {
    /** @param {number} n */
    read: async (n) => {
      const pr = await rest("GET", `/pulls/${n}`);
      const [commits, files, reviews, comments, events] = await Promise.all([
        rest("GET", `/pulls/${n}/commits?per_page=${PAGE}`),
        rest("GET", `/pulls/${n}/files?per_page=${PAGE}`),
        rest("GET", `/pulls/${n}/reviews?per_page=${PAGE}`),
        rest("GET", `/issues/${n}/comments?per_page=${PAGE}`),
        rest("GET", `/issues/${n}/events?per_page=${PAGE}`),
      ]);
      return { pr, commits, files, reviews, comments, events };
    },
    /** @param {number} n @param {string} sha @param {string} body */
    approve: (n, sha, body) => rest("POST", `/pulls/${n}/reviews`, { commit_id: sha, event: "APPROVE", body }),
    /** @param {number} n @param {number} id @param {string} message */
    dismiss: (n, id, message) => rest("PUT", `/pulls/${n}/reviews/${id}/dismissals`, { message, event: "DISMISS" }),
    /** @param {number} n @param {string} body */
    comment: (n, body) => rest("POST", `/issues/${n}/comments`, { body }),
    /** Auto-merge with a merge commit, refused by GitHub if the head is no longer `head`. @param {string} id @param {string} head */
    enableAutoMerge: (id, head) =>
      graphql(
        "mutation($id: ID!, $head: GitObjectID!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, expectedHeadOid: $head, mergeMethod: MERGE }) { clientMutationId } }",
        { id, head },
      ),
    /** Merges now with a merge commit, refused by GitHub if the head is no longer `sha`. @param {number} n @param {string} sha */
    merge: (n, sha) => rest("PUT", `/pulls/${n}/merge`, { sha, merge_method: "merge" }),
    /** @param {string} id */
    disableAutoMerge: (id) => graphql("mutation($id: ID!) { disablePullRequestAutoMerge(input: { pullRequestId: $id }) { clientMutationId } }", { id }),
  };
}

/** @typedef {ReturnType<typeof createGitHub>} GitHub */

/** @param {string} page @param {string} login */
const approval = (page, login) =>
  `The website editor's change to ${ALLOWED_DIR}${page}.json alone, every commit by ${login}: approved automatically by .github/workflows/cms-auto-merge.yml.`;

/** @param {string} page @param {string} notify @param {boolean} merged */
const commentBody = (page, notify, merged) =>
  [
    MARKER,
    `This pull request changes only \`${ALLOWED_DIR}${page}.json\`, and every commit in it is the website editor's, so it was approved automatically and ${merged ? "merged, its required checks having passed" : "will merge itself once the required checks pass"}.${notify ? ` @${notify}` : ""}`,
    "",
    merged
      ? "To undo it, revert the merge commit on main."
      : "To stop it, disable auto-merge or push a commit of your own (either leaves it for a maintainer to merge), or close it with a comment, which the editor sees.",
  ].join("\n");

/**
 * Runs one mode. Returns the exit code; what it found goes to `log`. GitHub errors that
 * outlast the retries throw, so the job fails. A failed check is followed by `withdraw`
 * (the safe direction), so the pull request waits for a maintainer, or for its next event.
 * @param {string} mode @param {Record<string, string | undefined>} env @param {GitHub} github
 * @param {(line: string) => void} log
 */
export async function main(mode, env, github, log = console.log) {
  if (!["check", "merge", "withdraw"].includes(mode)) {
    log(`::error::Unknown mode "${escapeCommand(mode)}": use check, merge or withdraw.`);
    return 1;
  }
  const required = ["PR_NUMBER", ...(mode === "check" ? ["GITHUB_OUTPUT"] : []), ...(mode === "merge" ? ["HEAD_SHA"] : [])];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) {
    log(`::error::The CMS auto-merge needs ${missing.join(", ")}.`);
    return 1;
  }
  if (!/^[1-9]\d*$/.test(env.PR_NUMBER ?? "")) {
    log("::error::PR_NUMBER is not a number.");
    return 1;
  }
  const n = Number(env.PR_NUMBER);
  const botLogin = (env.CMS_BOT_LOGIN ?? "").trim();
  const state = await github.read(n);
  const { pr } = state;
  const problems = checkAutoMerge({ botLogin, repository: env.GITHUB_REPOSITORY ?? "", ...state });
  const eligible = problems.length === 0 && mode !== "withdraw";
  const page = pageFromBranch(String(pr.head.ref)) ?? "";

  if (problems.length) {
    log(`Pull request #${n} is left for a maintainer:`);
    for (const problem of problems) log(`- ${escapeCommand(problem)}`);
  }
  if (mode === "check") {
    if (eligible) log(`Pull request #${n} can merge itself: it is ${botLogin}'s change to ${ALLOWED_DIR}${page}.json alone.`);
    fs.appendFileSync(env.GITHUB_OUTPUT ?? "", `eligible=${eligible}\nhead_sha=${pr.head.sha}\n`);
    return 0;
  }
  if (eligible && pr.head.sha !== env.HEAD_SHA) {
    log(`::notice::The head moved from ${short(env.HEAD_SHA ?? "")} to ${short(pr.head.sha)} after the check; the next run decides.`);
    return 0;
  }

  const plan = planActions({ eligible, ...state });
  for (const id of plan.dismiss) {
    await github.dismiss(n, id, "This pull request no longer only holds the website editor's change, so it is left for a maintainer.");
  }
  if (plan.disable) await github.disableAutoMerge(pr.node_id);
  if (plan.approve) await github.approve(n, pr.head.sha, approval(page, botLogin));
  let merged = false;
  if (plan.enable) {
    try {
      await github.enableAutoMerge(pr.node_id, pr.head.sha);
    } catch (e) {
      // GitHub refuses auto-merge on a pull request that may already merge: its required
      // checks passed before it was approved ("clean"), with a check that is not required
      // still pending or failing ("unstable"), or with hooks to run ("has_hooks"). Merging that
      // head now is the same, under the same protection.
      if (!/\b(clean|unstable|has_hooks) status/i.test(String(e))) throw e;
      await github.merge(n, pr.head.sha);
      merged = true;
    }
  }
  if (plan.comment) await github.comment(n, commentBody(page, (env.NOTIFY ?? "").trim(), merged));
  const done = [
    plan.dismiss.length && `dismissed ${plan.dismiss.length} approval(s)`,
    plan.disable && "turned off auto-merge",
    plan.approve && "approved",
    plan.enable && (merged ? "merged" : "turned on auto-merge"),
    plan.comment && "commented",
  ].filter(Boolean);
  log(done.length ? `Pull request #${n}: ${done.join(", ")}.` : eligible ? `Pull request #${n} is already set to merge itself.` : `Nothing to take back on pull request #${n}.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv[2] ?? "", process.env, createGitHub(process.env)));
}
