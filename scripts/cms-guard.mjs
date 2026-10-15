/**
 * The CMS guard, run on every pull request by .github/workflows/cms-guard.yml. The website
 * editor publishes through a GitHub App, whose bot account may only ever change files under
 * `content/`, and only from `cms/*` branches. This fails a pull request when:
 *
 * - the bot's login is not configured (the guard fails closed rather than passing everything);
 * - the bot opened it from a branch outside `cms/`;
 * - any of its commits authored or committed by the bot changes a file outside `content/`.
 *
 * Commits by anyone else are not restricted: a maintainer may push layout fixes to a CMS
 * branch before merging. The bot is recognised by its git name or its GitHub noreply email.
 *
 * Self-contained on purpose (Node built-ins only, nothing from the repo): the workflow runs
 * the copy on `main`, so a pull request cannot change the guard that judges it.
 *
 * Settings (environment): CMS_BOT_LOGIN (e.g. `my-app[bot]`), PR_AUTHOR, HEAD_REF, BASE_SHA,
 * HEAD_SHA.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const ALLOWED_DIR = "content/";
export const BRANCH_PREFIX = "cms/";

/** @typedef {{ name: string, email: string }} Identity */
/** @typedef {{ sha: string, author: Identity, committer: Identity, files: string[] }} Commit */

/**
 * Whether a git identity is the bot's. GitHub writes the bot's commits as `<login>` with the
 * email `<id>+<login>@users.noreply.github.com`.
 * @param {Identity} who
 * @param {string} botLogin
 */
export function isBot(who, botLogin) {
  const login = botLogin.toLowerCase();
  const email = who.email.toLowerCase();
  return (
    who.name.toLowerCase() === login ||
    email === `${login}@users.noreply.github.com` ||
    email.endsWith(`+${login}@users.noreply.github.com`)
  );
}

/**
 * Every reason the pull request must not pass; none means it may.
 * @param {{ botLogin: string, prAuthor: string, headRef: string, commits: Commit[] }} pr
 * @returns {string[]}
 */
export function checkPullRequest({ botLogin, prAuthor, headRef, commits }) {
  const login = botLogin.trim();
  if (!login) {
    return [
      "CMS_BOT_LOGIN is not set, so the guard cannot tell the website editor's commits apart. " +
        "Set the repository variable CMS_BOT_LOGIN to the GitHub App's bot login (see github-app-setup.md).",
    ];
  }
  const problems = [];
  if (prAuthor.toLowerCase() === login.toLowerCase() && !headRef.startsWith(BRANCH_PREFIX)) {
    problems.push(`${login} opened this pull request from ${headRef}, which is not a ${BRANCH_PREFIX}* branch.`);
  }
  for (const commit of commits) {
    if (!isBot(commit.author, login) && !isBot(commit.committer, login)) continue;
    const outside = commit.files.filter((file) => !file.startsWith(ALLOWED_DIR));
    if (outside.length) {
      problems.push(`Commit ${commit.sha.slice(0, 12)} by ${login} changes files outside ${ALLOWED_DIR}: ${outside.join(", ")}`);
    }
  }
  return problems;
}

/** @param {string[]} args @param {string} cwd */
function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * The pull request's commits (in HEAD_SHA, not in BASE_SHA), oldest first, with the files each
 * changes. A merge commit lists the files it changes against each parent.
 * @param {string} base @param {string} head @param {string} cwd
 * @returns {Commit[]}
 */
export function readCommits(base, head, cwd) {
  const shas = git(["rev-list", "--reverse", `${base}..${head}`], cwd).split("\n").filter(Boolean);
  return shas.map((sha) => {
    const [an, ae, cn, ce] = git(["show", "-s", "--format=%an%x00%ae%x00%cn%x00%ce", sha], cwd).trimEnd().split("\0");
    const files = git(["diff-tree", "--no-commit-id", "--name-only", "-r", "--no-renames", "-m", "--root", sha], cwd)
      .split("\n")
      .filter(Boolean);
    return { sha, author: { name: an, email: ae }, committer: { name: cn, email: ce }, files: [...new Set(files)] };
  });
}

/**
 * Runs the guard. Returns the exit code; what it found goes to `log`.
 * @param {Record<string, string | undefined>} env @param {string} cwd @param {(line: string) => void} log
 */
export function main(env, cwd, log = console.log) {
  const required = ["BASE_SHA", "HEAD_SHA"];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) {
    log(`::error::The CMS guard needs ${missing.join(", ")}.`);
    return 1;
  }
  const commits = readCommits(env.BASE_SHA ?? "", env.HEAD_SHA ?? "", cwd);
  const problems = checkPullRequest({
    botLogin: env.CMS_BOT_LOGIN ?? "",
    prAuthor: env.PR_AUTHOR ?? "",
    headRef: env.HEAD_REF ?? "",
    commits,
  });
  for (const problem of problems) log(`::error::${problem}`);
  if (problems.length) return 1;
  log(`CMS guard: ${commits.length} commit(s) checked; nothing by ${env.CMS_BOT_LOGIN} outside ${ALLOWED_DIR}.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.env, process.cwd()));
}
