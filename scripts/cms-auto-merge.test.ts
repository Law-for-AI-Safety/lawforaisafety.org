import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkAutoMerge, createGitHub, main, pageFromBranch, planActions, MARKER } from "./cms-auto-merge.mjs";

/**
 * The CMS auto-merge (.github/workflows/cms-auto-merge.yml): which pull requests merge
 * themselves, what the workflow does about each, and the script end to end against a fake
 * GitHub API.
 */

const BOT = "lais-cms[bot]";
const REPO = "Law-for-AI-Safety/lawforaisafety.org";
const ACTIONS = "github-actions[bot]";
const HEAD = "b".repeat(40);
const gitBot = { name: BOT, email: `123456+${BOT}@users.noreply.github.com` };
const gitOwner = { name: "Owner", email: "owner@example.com" };

type Who = { name: string; email: string };
const commit = (author: Who = gitBot, committer: Who = author, extra: Record<string, unknown> = {}) => ({
  sha: HEAD,
  author: { login: author === gitBot ? BOT : "owner" },
  committer: { login: committer === gitBot ? BOT : "owner" },
  parents: [{ sha: "a".repeat(40) }],
  commit: { author, committer, verification: { verified: true } },
  ...extra,
});

const pr = (extra: Record<string, unknown> = {}) => ({
  number: 7,
  node_id: "PR_7",
  state: "open",
  draft: false,
  user: { login: BOT },
  head: { ref: "cms/field-building-2026-10-15", sha: HEAD, repo: { full_name: REPO } },
  base: { ref: "main", repo: { full_name: REPO } },
  commits: 1,
  changed_files: 1,
  auto_merge: null,
  ...extra,
});

const files = (...list: Record<string, unknown>[]) => (list.length ? list : [{ filename: "content/field-building.json", status: "modified" }]);
const input = (over: Record<string, unknown> = {}) => ({ botLogin: BOT, repository: REPO, pr: pr(), commits: [commit()], files: files(), ...over });

describe("pageFromBranch", () => {
  it("reads the page from cms/<page>-<YYYY-MM-DD>, with an optional -N", () => {
    expect(pageFromBranch("cms/field-building-2026-10-15")).toBe("field-building");
    expect(pageFromBranch("cms/home-2026-10-15-2")).toBe("home");
    expect(pageFromBranch("cms/a-2-b-2026-01-31-10")).toBe("a-2-b");
  });

  it("refuses anything else", () => {
    for (const ref of [
      "cms/field-building",
      "cms/field-building-2026-10-15-1",
      "cms/field-building-2026-10-15-02",
      "cms/Field-2026-10-15",
      "cms/../x-2026-10-15",
      "cms/a/b-2026-10-15",
      "cms/-2026-10-15",
      "cms/a--b-2026-10-15",
      "x/cms/a-2026-10-15",
      "cms/a-2026-10-15\n",
      "cms/a-26-10-15",
    ]) {
      expect(pageFromBranch(ref), ref).toBeNull();
    }
  });
});

describe("checkAutoMerge", () => {
  it("passes the website editor's own one-file change to its page", () => {
    expect(checkAutoMerge(input())).toEqual([]);
  });

  it("passes several commits when every one is the bot's", () => {
    expect(checkAutoMerge(input({ pr: pr({ commits: 2 }), commits: [commit(), commit()] }))).toEqual([]);
  });

  it("fails closed without a bot login, or with a person's login", () => {
    expect(checkAutoMerge(input({ botLogin: " " }))).toEqual([expect.stringMatching(/^CMS_BOT_LOGIN is not set/)]);
    expect(checkAutoMerge(input({ botLogin: "hturnbull93" }))).toEqual([expect.stringMatching(/not a GitHub App's bot login/)]);
  });

  it("leaves a pull request someone else opened", () => {
    expect(checkAutoMerge(input({ pr: pr({ user: { login: "hturnbull93" } }) }))).toEqual(["It was opened by hturnbull93, not lais-cms[bot]."]);
  });

  it("knows the bot's login in any case", () => {
    expect(checkAutoMerge(input({ pr: pr({ user: { login: "LAIS-CMS[bot]" } }) }))).toEqual([]);
  });

  it("leaves a pull request from a fork, or into another branch", () => {
    expect(checkAutoMerge(input({ pr: pr({ head: { ...pr().head, repo: { full_name: "someone/lawforaisafety.org" } } }) }))).toEqual([
      "Its branch is in someone/lawforaisafety.org, not this repository.",
    ]);
    expect(checkAutoMerge(input({ pr: pr({ head: { ...pr().head, repo: null } }) }))).toEqual([
      "Its branch is in a deleted repository, not this repository.",
    ]);
    expect(checkAutoMerge(input({ pr: pr({ base: { ref: "staging", repo: { full_name: REPO } } }) }))).toEqual(["It is into staging, not main."]);
    expect(checkAutoMerge(input({ pr: pr({ base: { ref: "main", repo: { full_name: "other/repo" } } }) }))).toEqual([
      "Its base is in other/repo, not this repository.",
    ]);
  });

  it("leaves a closed or draft pull request", () => {
    expect(checkAutoMerge(input({ pr: pr({ state: "closed" }) }))).toEqual(["It is closed."]);
    expect(checkAutoMerge(input({ pr: pr({ draft: true }) }))).toEqual(["It is a draft."]);
  });

  it("leaves a branch that is not cms/<page>-<date>", () => {
    expect(checkAutoMerge(input({ pr: pr({ head: { ...pr().head, ref: "hturnbull93/fix" } }) }))).toEqual([
      "Its branch hturnbull93/fix is not cms/<page>-<YYYY-MM-DD>.",
    ]);
  });

  it("leaves a change to any other file, or more than one", () => {
    expect(checkAutoMerge(input({ files: files({ filename: "content/home.json", status: "modified" }) }))).toEqual([
      "It changes content/home.json, not only content/field-building.json.",
    ]);
    expect(
      checkAutoMerge(
        input({
          pr: pr({ changed_files: 2 }),
          files: files({ filename: "content/field-building.json", status: "modified" }, { filename: "src/app/page.tsx", status: "modified" }),
        }),
      ),
    ).toEqual(["It changes 2 files, not only content/field-building.json."]);
  });

  it("leaves an added, removed or renamed file", () => {
    for (const status of ["added", "removed", "renamed", "copied", "changed"]) {
      expect(checkAutoMerge(input({ files: files({ filename: "content/field-building.json", status }) })), status).toEqual([
        `It does not only modify content/field-building.json (${status}).`,
      ]);
    }
    expect(
      checkAutoMerge(input({ files: files({ filename: "content/field-building.json", status: "modified", previous_filename: "x.json" }) })),
    ).toEqual(["It does not only modify content/field-building.json (renamed from x.json)."]);
  });

  it("leaves a pull request whose file list or commit list may be incomplete", () => {
    expect(checkAutoMerge(input({ pr: pr({ changed_files: 101 }) }))).toEqual([expect.stringMatching(/^GitHub listed 1 of its 101 changed files/)]);
    expect(checkAutoMerge(input({ pr: pr({ commits: 2 }) }))).toEqual([expect.stringMatching(/^GitHub listed 1 of its 2 commits/)]);
    expect(checkAutoMerge(input({ pr: pr({ commits: 0 }), commits: [] }))).toEqual(["It has no commits."]);
  });

  it("leaves a pull request whose head moved since it was read", () => {
    expect(checkAutoMerge(input({ commits: [commit(gitBot, gitBot, { sha: "c".repeat(40) })] }))).toEqual([
      `Its last commit is cccccccccccc, not its head ${HEAD.slice(0, 12)}.`,
    ]);
  });

  it("leaves a commit a maintainer authored or committed", () => {
    const sha = HEAD.slice(0, 12);
    expect(checkAutoMerge(input({ commits: [commit(gitOwner, gitOwner)] }))).toEqual([`Commit ${sha} is not authored and committed by ${BOT}.`]);
    expect(checkAutoMerge(input({ commits: [commit(gitBot, gitOwner)] }))).toEqual([`Commit ${sha} is not authored and committed by ${BOT}.`]);
    expect(checkAutoMerge(input({ commits: [commit(gitOwner, gitBot)] }))).toEqual([`Commit ${sha} is not authored and committed by ${BOT}.`]);
  });

  it("needs the GitHub account and the git identity both to be the bot's", () => {
    const sha = HEAD.slice(0, 12);
    // The git name says bot, but GitHub tied the commit to no account or another one.
    expect(checkAutoMerge(input({ commits: [commit(gitBot, gitBot, { author: null })] }))).toEqual([`Commit ${sha} is not authored and committed by ${BOT}.`]);
    expect(checkAutoMerge(input({ commits: [commit(gitBot, gitBot, { committer: { login: "owner" } })] }))).toEqual([
      `Commit ${sha} is not authored and committed by ${BOT}.`,
    ]);
    // The account is the bot's but the git identity is someone else's.
    const c = commit();
    c.commit.committer = gitOwner;
    expect(checkAutoMerge(input({ commits: [c] }))).toEqual([`Commit ${sha} is not authored and committed by ${BOT}.`]);
  });

  it("leaves an unsigned commit or a merge commit, even the bot's", () => {
    const unsigned = commit();
    unsigned.commit.verification = { verified: false };
    expect(checkAutoMerge(input({ commits: [unsigned] }))).toEqual([`Commit ${HEAD.slice(0, 12)} is not signed by GitHub.`]);
    expect(checkAutoMerge(input({ commits: [commit(gitBot, gitBot, { parents: [{ sha: "1" }, { sha: "2" }] })] }))).toEqual([
      `Commit ${HEAD.slice(0, 12)} is a merge commit.`,
    ]);
  });

  it("lists every reason at once", () => {
    expect(checkAutoMerge(input({ pr: pr({ user: { login: "x" }, draft: true }), commits: [commit(gitOwner)] }))).toHaveLength(3);
  });
});

describe("planActions", () => {
  const review = (extra: Record<string, unknown> = {}) => ({ id: 1, user: { login: ACTIONS }, state: "APPROVED", commit_id: HEAD, ...extra });
  const enabledBy = (login: string) => ({ enabled_by: { login }, merge_method: "merge" });

  it("approves, enables auto-merge and comments on an eligible pull request", () => {
    expect(planActions({ eligible: true, pr: pr(), reviews: [], comments: [] })).toEqual({ approve: true, enable: true, comment: true, dismiss: [], disable: false });
  });

  it("does nothing twice", () => {
    expect(
      planActions({ eligible: true, pr: pr({ auto_merge: enabledBy(ACTIONS) }), reviews: [review()], comments: [{ user: { login: ACTIONS }, body: `${MARKER}\nx` }] }),
    ).toEqual({ approve: false, enable: false, comment: false, dismiss: [], disable: false });
  });

  it("approves again when its approval was for an older head, or was dismissed", () => {
    expect(planActions({ eligible: true, pr: pr(), reviews: [review({ commit_id: "c".repeat(40) })], comments: [] }).approve).toBe(true);
    expect(planActions({ eligible: true, pr: pr(), reviews: [review({ state: "DISMISSED" })], comments: [] }).approve).toBe(true);
    expect(planActions({ eligible: true, pr: pr(), reviews: [review({ user: { login: "owner" } })], comments: [] }).approve).toBe(true);
  });

  it("does not count a marker comment written by someone else", () => {
    expect(planActions({ eligible: true, pr: pr(), reviews: [], comments: [{ user: { login: "owner" }, body: MARKER }] }).comment).toBe(true);
  });

  it("leaves auto-merge a maintainer already turned on as they set it", () => {
    expect(planActions({ eligible: true, pr: pr({ auto_merge: { enabled_by: { login: "owner" }, merge_method: "squash" } }), reviews: [], comments: [] }).enable).toBe(false);
  });

  it("takes back only its own approvals and its own auto-merge when no longer eligible", () => {
    expect(
      planActions({
        eligible: false,
        pr: pr({ auto_merge: enabledBy(ACTIONS) }),
        reviews: [review({ id: 1 }), review({ id: 2, commit_id: "c".repeat(40) }), review({ id: 3, user: { login: "owner" } }), review({ id: 4, state: "DISMISSED" })],
        comments: [],
      }),
    ).toEqual({ approve: false, enable: false, comment: false, dismiss: [1, 2], disable: true });
  });

  it("leaves auto-merge a maintainer turned on", () => {
    expect(planActions({ eligible: false, pr: pr({ auto_merge: enabledBy("owner") }), reviews: [], comments: [] })).toEqual({
      approve: false,
      enable: false,
      comment: false,
      dismiss: [],
      disable: false,
    });
  });
});

/** A fake of the GitHub REST and GraphQL API, recording every request. */
function fakeApi(state: { pr: ReturnType<typeof pr>; commits: unknown[]; files: unknown[]; reviews: unknown[]; comments: unknown[] }) {
  const requests: { method: string; url: string; body: unknown; auth: string | null }[] = [];
  const fetch = async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : null;
    requests.push({ method, url, body, auth: new Headers(init.headers).get("authorization") });
    const route = url.replace(`https://api.github.com/repos/${REPO}`, "");
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
    if (method === "GET" && route === "/pulls/7") return json(state.pr);
    if (method === "GET" && route === "/pulls/7/commits?per_page=100") return json(state.commits);
    if (method === "GET" && route === "/pulls/7/files?per_page=100") return json(state.files);
    if (method === "GET" && route === "/pulls/7/reviews?per_page=100") return json(state.reviews);
    if (method === "GET" && route === "/issues/7/comments?per_page=100") return json(state.comments);
    if (method === "POST" && route === "/pulls/7/reviews") return json({ id: 9 });
    if (method === "PUT" && /^\/pulls\/7\/reviews\/\d+\/dismissals$/.test(route)) return json({});
    if (method === "POST" && route === "/issues/7/comments") return json({});
    if (method === "POST" && url === "https://api.github.com/graphql") return json({ data: {} });
    return json({ message: "Not Found" }, 404);
  };
  return { fetch, requests, writes: () => requests.filter((r) => r.method !== "GET").map(({ method, url, body }) => ({ method, url, body })) };
}

describe("the script, against a fake GitHub", () => {
  let dir: string;
  let out: string;
  const env = (over: Record<string, string> = {}) => ({
    CMS_BOT_LOGIN: BOT,
    GITHUB_REPOSITORY: REPO,
    GITHUB_API_URL: "https://api.github.com",
    GITHUB_TOKEN: "test-token",
    GITHUB_OUTPUT: out,
    PR_NUMBER: "7",
    NOTIFY: "owner",
    ...over,
  });
  const run = async (mode: string, api: ReturnType<typeof fakeApi>, over: Record<string, string> = {}) => {
    const lines: string[] = [];
    const e = env(over);
    const code = await main(mode, e, createGitHub(e, api.fetch as typeof fetch), (line) => lines.push(line));
    return { code, lines };
  };
  const state = () => ({ pr: pr(), commits: [commit()], files: files(), reviews: [] as unknown[], comments: [] as unknown[] });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cms-auto-merge-"));
    out = path.join(dir, "output");
    fs.writeFileSync(out, "");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("check: says an eligible pull request may merge, writing nothing to GitHub", async () => {
    const api = fakeApi(state());
    expect(await run("check", api)).toEqual({ code: 0, lines: [`Pull request #7 can merge itself: it is ${BOT}'s change to content/field-building.json alone.`] });
    expect(fs.readFileSync(out, "utf8")).toBe(`eligible=true\nhead_sha=${HEAD}\n`);
    expect(api.writes()).toEqual([]);
    expect(api.requests.every((r) => r.auth === "Bearer test-token")).toBe(true);
  });

  it("check: lists why a pull request is left for a maintainer", async () => {
    const api = fakeApi({ ...state(), commits: [commit(gitOwner)] });
    const { code, lines } = await run("check", api);
    expect(code).toBe(0);
    expect(lines).toEqual(["Pull request #7 is left for a maintainer:", `- Commit ${HEAD.slice(0, 12)} is not authored and committed by ${BOT}.`]);
    expect(fs.readFileSync(out, "utf8")).toBe(`eligible=false\nhead_sha=${HEAD}\n`);
  });

  it("merge: approves the head it checked, enables auto-merge for that head, and comments once", async () => {
    const api = fakeApi(state());
    expect((await run("merge", api, { HEAD_SHA: HEAD })).code).toBe(0);
    expect(api.writes()).toEqual([
      {
        method: "POST",
        url: `https://api.github.com/repos/${REPO}/pulls/7/reviews`,
        body: { commit_id: HEAD, event: "APPROVE", body: expect.stringContaining("content/field-building.json") },
      },
      {
        method: "POST",
        url: "https://api.github.com/graphql",
        body: { query: expect.stringContaining("enablePullRequestAutoMerge"), variables: { id: "PR_7", head: HEAD } },
      },
      {
        method: "POST",
        url: `https://api.github.com/repos/${REPO}/issues/7/comments`,
        body: { body: expect.stringContaining(MARKER) },
      },
    ]);
    expect(String((api.writes()[1].body as { query: string }).query)).toContain("mergeMethod: MERGE");
    expect((api.writes()[2].body as { body: string }).body).toContain("@owner");
  });

  it("merge: comments without a mention when nobody is to be notified", async () => {
    const api = fakeApi(state());
    await run("merge", api, { HEAD_SHA: HEAD, NOTIFY: "" });
    expect((api.writes()[2].body as { body: string }).body).not.toContain("@");
  });

  it("merge: re-checks, and takes back instead when the pull request changed since", async () => {
    const api = fakeApi({
      ...state(),
      pr: pr({ auto_merge: { enabled_by: { login: ACTIONS } } }),
      commits: [commit(gitOwner)],
      reviews: [{ id: 5, user: { login: ACTIONS }, state: "APPROVED", commit_id: HEAD }],
    });
    const { code, lines } = await run("merge", api, { HEAD_SHA: HEAD });
    expect(code).toBe(0);
    expect(lines[0]).toBe("Pull request #7 is left for a maintainer:");
    expect(api.writes()).toEqual([
      { method: "PUT", url: `https://api.github.com/repos/${REPO}/pulls/7/reviews/5/dismissals`, body: { message: expect.any(String), event: "DISMISS" } },
      { method: "POST", url: "https://api.github.com/graphql", body: { query: expect.stringContaining("disablePullRequestAutoMerge"), variables: { id: "PR_7" } } },
    ]);
  });

  it("merge: refuses when the head is not the one the check approved", async () => {
    const api = fakeApi(state());
    expect(await run("merge", api, { HEAD_SHA: "c".repeat(40) })).toEqual({
      code: 0,
      lines: [`::notice::The head moved from cccccccccccc to ${HEAD.slice(0, 12)} after the check; the next run decides.`],
    });
    expect(api.writes()).toEqual([]);
  });

  it("withdraw: dismisses its approvals and turns off its auto-merge", async () => {
    const api = fakeApi({
      ...state(),
      pr: pr({ auto_merge: { enabled_by: { login: ACTIONS } } }),
      commits: [commit(gitOwner)],
      reviews: [{ id: 5, user: { login: ACTIONS }, state: "APPROVED", commit_id: HEAD }],
    });
    expect((await run("withdraw", api)).code).toBe(0);
    expect(api.writes().map((w) => w.method)).toEqual(["PUT", "POST"]);
  });

  it("withdraw: still withdraws when the pull request would be eligible", async () => {
    // Run only after a failed check: the safe direction is always to take back.
    const api = fakeApi({ ...state(), pr: pr({ auto_merge: { enabled_by: { login: ACTIONS } } }), reviews: [{ id: 5, user: { login: ACTIONS }, state: "APPROVED", commit_id: HEAD }] });
    expect((await run("withdraw", api)).code).toBe(0);
    expect(api.writes().map((w) => w.method)).toEqual(["PUT", "POST"]);
  });

  it("withdraw: writes nothing when there is nothing of its own to take back", async () => {
    const api = fakeApi({ ...state(), commits: [commit(gitOwner)] });
    const { code, lines } = await run("withdraw", api);
    expect(code).toBe(0);
    expect(lines.at(-1)).toBe("Nothing to take back on pull request #7.");
    expect(api.writes()).toEqual([]);
  });

  it("fails on a missing setting or an unknown mode, before calling GitHub", async () => {
    const api = fakeApi(state());
    expect(await run("check", api, { PR_NUMBER: "" })).toEqual({ code: 1, lines: ["::error::The CMS auto-merge needs PR_NUMBER."] });
    expect(await run("check", api, { PR_NUMBER: "7; rm" })).toEqual({ code: 1, lines: ["::error::PR_NUMBER is not a number."] });
    expect(await run("merge", api)).toEqual({ code: 1, lines: ["::error::The CMS auto-merge needs HEAD_SHA."] });
    expect(await run("other", api)).toEqual({ code: 1, lines: ['::error::Unknown mode "other": use check, merge or withdraw.'] });
    expect(api.requests).toEqual([]);
  });

  it("throws on a GitHub error, so the job fails", async () => {
    const api = fakeApi(state());
    await expect(run("check", api, { PR_NUMBER: "8" })).rejects.toThrow("GET /pulls/8: 404 Not Found");
  });

  it("merge: merges that head at once when GitHub says it may already merge", async () => {
    const api = fakeApi(state());
    const clean = async (url: string, init: RequestInit = {}) => {
      if (url.endsWith("/graphql")) {
        await api.fetch(url, init);
        return new Response(JSON.stringify({ errors: [{ message: "Pull request Pull request is in clean status" }] }), { status: 200 });
      }
      if (url.endsWith("/pulls/7/merge")) {
        api.requests.push({ method: init.method ?? "GET", url, body: JSON.parse(String(init.body)), auth: null });
        return new Response(JSON.stringify({ merged: true }), { status: 200 });
      }
      return api.fetch(url, init);
    };
    const e = env({ HEAD_SHA: HEAD });
    const lines: string[] = [];
    expect(await main("merge", e, createGitHub(e, clean as typeof fetch), (line) => lines.push(line))).toBe(0);
    expect(api.writes().map((w) => w.url.replace("https://api.github.com", ""))).toEqual([
      `/repos/${REPO}/pulls/7/reviews`,
      "/graphql",
      `/repos/${REPO}/pulls/7/merge`,
      `/repos/${REPO}/issues/7/comments`,
    ]);
    expect(api.writes()[2].body).toEqual({ sha: HEAD, merge_method: "merge" });
    expect(lines).toEqual(["Pull request #7: approved, merged, commented."]);
  });

  it("merge: says so when there is nothing left to do", async () => {
    const api = fakeApi({
      ...state(),
      pr: pr({ auto_merge: { enabled_by: { login: ACTIONS } } }),
      reviews: [{ id: 5, user: { login: ACTIONS }, state: "APPROVED", commit_id: HEAD }],
      comments: [{ user: { login: ACTIONS }, body: MARKER }],
    });
    expect(await run("merge", api, { HEAD_SHA: HEAD })).toEqual({ code: 0, lines: ["Pull request #7 is already set to merge itself."] });
    expect(api.writes()).toEqual([]);
  });

  it("throws on a GraphQL error", async () => {
    const api = fakeApi(state());
    const failing = async (url: string, init: RequestInit = {}) =>
      url.endsWith("/graphql") ? new Response(JSON.stringify({ errors: [{ message: "Auto merge is not allowed" }] }), { status: 200 }) : api.fetch(url, init);
    const e = env({ HEAD_SHA: HEAD });
    await expect(main("merge", e, createGitHub(e, failing as typeof fetch), () => {})).rejects.toThrow("GraphQL: Auto merge is not allowed");
  });
});
