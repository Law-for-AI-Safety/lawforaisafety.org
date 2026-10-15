import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOT_LOGIN, github, githubEnv } from "../../test/fakes/github";
import { contentRoutes, contentSlugs, defaultDirs, formatContent, printContent } from "./content-files";
import { GitHubAppClient, GitHubError, type GitHubClient } from "./github";
import { gitHubSetup } from "./github-config";
import { pageSchema } from "./schema";
import {
  branchName,
  commitMessage,
  publishToGitHub,
  pullRequestBody,
  pullRequestTitle,
  readOutcome,
  withdrawFromGitHub,
  type PublishInput,
} from "./publish";

/**
 * Publishing against the fake GitHub: the pull request it opens (branch, the one file, its
 * exact text, title and body), what it refuses, and that a failure at any step leaves no
 * branch without a pull request behind.
 */

const SLUG = "field-building";
const PATH = "content/field-building.json";
const FILE = fs.readFileSync(PATH, "utf8");
const file = JSON.parse(FILE);
const NOW = new Date("2026-10-15T12:00:00Z");
const dirs = defaultDirs();
const routes = contentRoutes(dirs, contentSlugs(dirs.contentDir));

function client(): GitHubClient {
  const setup = gitHubSetup(githubEnv());
  if (!setup.ok) throw new Error(setup.problem);
  return new GitHubAppClient(setup.config);
}

function edited() {
  const draft = structuredClone(file);
  draft.title = "Field-building";
  draft.blocks[0].lede = "Lawyers are ==needed== in [AI safety](/council-of-europe).";
  return draft;
}

let baseHash: string;
const input = (over: Partial<PublishInput> = {}): PublishInput => ({
  slug: SLUG,
  draft: edited(),
  baseHash,
  editorName: "Jane Editor",
  now: NOW,
  publicDir: dirs.publicDir,
  routes,
  ...over,
});
/** The requests that would change anything on GitHub. */
const writes = () => github.requests.filter((r) => r.method !== "GET" && !r.path.endsWith("/access_tokens"));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  baseHash = github.fileOnMain(PATH, FILE);
});

const EXPECTED_TEXT = printContent(pageSchema(SLUG).parse({ ...edited(), updatedAt: "2026-10-15" }));

const EXPECTED_BODY = (preview: string) => `An editor sent changes to the page at \`/field-building\` from the website editor. This pull request changes only \`content/field-building.json\`.

- **Sent by:** \`Jane Editor\`
- **Deploy preview:** ${preview}
- **Publish checks:** all passed on the committed file: fields valid, canonical formatting, every site link leads to a page, every image exists, one main heading.

## Changes (2)

### Page title

Before:

\`\`\`text
${file.title}
\`\`\`

After:

\`\`\`text
Field-building
\`\`\`

### Block 1 (Page heading) › Introduction

Before:

\`\`\`text
${file.blocks[0].lede}
\`\`\`

After:

\`\`\`text
Lawyers are ==needed== in [AI safety](/council-of-europe).
\`\`\`

---

Merging this makes the change live. To decline it, close this pull request with a comment: the editor sees the last comment. You may push your own commits to this branch first; the website editor never pushes to it again.
`;

describe("a publish", () => {
  it("opens one pull request from cms/<page>-<date> that changes only the page's content file", async () => {
    const result = await publishToGitHub(client(), input());
    expect(result).toEqual({
      ok: true,
      number: 1,
      url: "https://github.com/Law-for-AI-Safety/lawforaisafety.org/pull/1",
      branch: "cms/field-building-2026-10-15",
      previewUrl: "https://deploy-preview-1--law-for-ai-safety-org.netlify.app/field-building",
      changes: [expect.objectContaining({ label: "Page title" }), expect.objectContaining({ label: "Block 1 (Page heading) › Introduction" })],
      bodyUpdated: true,
    });

    const [pr] = github.openedPRs;
    expect(github.openedPRs).toHaveLength(1);
    expect(pr).toMatchObject({ head: "cms/field-building-2026-10-15", base: "main", state: "open" });
    expect(pr.files).toEqual({ [PATH]: EXPECTED_TEXT });
    expect(pr.commits).toEqual([
      { message: "Website edit: update the Field-building page\n\nSent from the website editor by Jane Editor.", author: BOT_LOGIN },
    ]);
    expect(pr.title).toBe("Website edit: update the Field-building page");
    expect(pr.body).toBe(EXPECTED_BODY("https://deploy-preview-1--law-for-ai-safety-org.netlify.app/field-building"));
    expect(github.fileOn("main", PATH)).toBe(FILE);
  });

  it("commits the canonical text with today's updatedAt, whatever order the draft's keys are in", async () => {
    const shuffled = Object.fromEntries(Object.entries(edited()).reverse());
    await publishToGitHub(client(), input({ draft: shuffled }));
    const text = github.openedPRs[0].files[PATH];
    expect(text).toBe(EXPECTED_TEXT);
    expect(formatContent(SLUG, text)).toBe(text);
    expect(JSON.parse(text).updatedAt).toBe("2026-10-15");
  });

  it("makes the commit before the branch, and opens the pull request before linking its preview", async () => {
    await publishToGitHub(client(), input());
    expect(writes().map((r) => `${r.method} ${r.path.replace(/^\/repos\/[^/]+\/[^/]+/, "")}`)).toEqual([
      "POST /git/trees",
      "POST /git/commits",
      "POST /git/refs",
      "POST /pulls",
      "PATCH /pulls/1",
    ]);
    expect((writes()[3].body as { body: string }).body).toBe(EXPECTED_BODY("The preview link is added here once this pull request has a number."));
  });

  it("adds a suffix when the branch name is taken", async () => {
    github.pushTo("main", {}, "noop");
    const c = client();
    const head = (await c.branchHead("main"))!;
    await c.createBranch("cms/field-building-2026-10-15", head.commit);
    await c.createBranch("cms/field-building-2026-10-15-2", head.commit);
    const result = await publishToGitHub(c, input());
    expect(result).toMatchObject({ ok: true, branch: "cms/field-building-2026-10-15-3" });
  });

  it("gives up when every branch name is taken, leaving no new branch", async () => {
    const c = client();
    const head = (await c.branchHead("main"))!;
    for (let i = 1; i <= 20; i++) await c.createBranch(branchName(SLUG, NOW, i), head.commit);
    const before = github.branches;
    expect(await publishToGitHub(c, input())).toMatchObject({ ok: false, reason: "github", step: "branch", leftBranch: null });
    expect(github.branches).toEqual(before);
    expect(github.openedPRs).toEqual([]);
  });
});

describe("refusals, before anything is written", () => {
  it("refuses when the live file changed since the draft started, listing what changed", async () => {
    const live = structuredClone(file);
    live.description = "Changed by a developer.";
    github.fileOnMain(PATH, printContent(live));
    expect(await publishToGitHub(client(), input())).toEqual({
      ok: false,
      reason: "stale",
      exact: true,
      changes: [{ path: ["description"], label: "Description", before: file.description, after: "Changed by a developer." }],
    });
    expect(writes()).toEqual([]);
    expect(github.branches).toEqual(["main"]);
  });

  it("compares with the draft itself when the starting file is not in the repo", async () => {
    expect(await publishToGitHub(client(), input({ baseHash: "0".repeat(40) }))).toMatchObject({
      ok: false,
      reason: "stale",
      exact: false,
      changes: [expect.objectContaining({ label: "Page title", before: "Field-building", after: file.title }), expect.anything()],
    });
    expect(writes()).toEqual([]);
  });

  it("treats a live file that is not JSON as changed throughout", async () => {
    github.fileOnMain(PATH, "not json");
    const result = await publishToGitHub(client(), input());
    expect(result).toMatchObject({ ok: false, reason: "stale", exact: true });
    expect(writes()).toEqual([]);
  });

  it("refuses when the page is not on main", async () => {
    expect(await publishToGitHub(client(), input({ slug: "no-such-page" }))).toEqual({ ok: false, reason: "missing" });
  });

  it("checks the exact text to be committed", async () => {
    const draft = edited();
    draft.blocks[0].lede = "See [this](/no-such-page).";
    expect(await publishToGitHub(client(), input({ draft }))).toEqual({
      ok: false,
      reason: "checks",
      problems: ["content/field-building.json: blocks.0.lede: The link /no-such-page does not lead to a page on this site"],
    });

    expect(await publishToGitHub(client(), input({ draft: { ...edited(), title: "" } }))).toEqual({ ok: false, reason: "checks", problems: ["title: Required"] });
    expect(writes()).toEqual([]);
  });

  it("has nothing to send when main already has the draft's text", async () => {
    expect(await publishToGitHub(client(), input({ draft: structuredClone(file) }))).toEqual({ ok: false, reason: "nothing" });
    expect(writes()).toEqual([]);
  });
});

describe("a failure at any step leaves no branch without a pull request", () => {
  it.each([
    ["GET /git/ref/heads/main", "read_main"],
    ["GET /git/commits/", "read_main"],
    ["GET /contents/", "read_main"],
    ["GET /git/blobs/", "read_main"],
    ["POST /git/trees", "commit"],
    ["POST /git/commits", "commit"],
    ["POST /git/refs", "branch"],
  ] as const)("when %s fails, at step %s", async (call, step) => {
    if (call === "GET /git/blobs/") github.fileOnMain(PATH, printContent({ ...file, description: "Moved on." }));
    github.failNext(call);
    const result = await publishToGitHub(client(), input());
    expect(result).toMatchObject({ ok: false, reason: "github", step, leftBranch: null, message: expect.stringContaining("Server Error") });
    expect(github.branches).toEqual(["main"]);
    expect(github.openedPRs).toEqual([]);
  });

  it("when main has gone", async () => {
    github.failNext("GET /git/ref/heads/main", { status: 404 });
    expect(await publishToGitHub(client(), input())).toMatchObject({ ok: false, reason: "github", step: "read_main", message: "The main branch was not found" });
  });

  it("when GitHub cannot be reached", async () => {
    github.failNext("POST /git/trees", { kind: "network" });
    expect(await publishToGitHub(client(), input())).toMatchObject({ ok: false, reason: "github", step: "commit", message: expect.stringMatching(/^Could not reach GitHub/) });
  });

  it("when opening the pull request fails, by deleting the branch again", async () => {
    github.failNext("POST /pulls");
    const result = await publishToGitHub(client(), input());
    expect(result).toMatchObject({ ok: false, reason: "github", step: "open", leftBranch: null });
    expect(github.branches).toEqual(["main"]);
    expect(github.openedPRs).toEqual([]);
  });

  it("and says which branch was left when deleting it fails too", async () => {
    github.failNext("POST /pulls");
    github.failNext("DELETE /git/refs/heads/cms/field-building-2026-10-15");
    const result = await publishToGitHub(client(), input());
    expect(result).toMatchObject({ ok: false, reason: "github", step: "open", leftBranch: "cms/field-building-2026-10-15" });
  });

  it("keeps the pull request when only the preview link could not be added", async () => {
    github.failNext("PATCH /pulls/1");
    const result = await publishToGitHub(client(), input());
    expect(result).toMatchObject({ ok: true, number: 1, bodyUpdated: false });
    expect(github.openedPRs[0].body).toBe(EXPECTED_BODY("The preview link is added here once this pull request has a number."));
  });

  it("lets an error that is not GitHub's through, at every step", async () => {
    const real = client();
    const broken = (method: keyof GitHubClient): GitHubClient =>
      new Proxy(real, {
        get(target, key, receiver) {
          if (key === method) return () => Promise.reject(new TypeError("bug"));
          const value = Reflect.get(target, key, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    for (const method of ["branchHead", "createCommit", "createBranch", "openPullRequest", "updatePullRequestBody"] as const) {
      await expect(publishToGitHub(broken(method), input())).rejects.toThrow("bug");
    }
    await expect(withdrawFromGitHub(broken("getPullRequest"), 1, "b")).rejects.toThrow("bug");
  });
});

describe("the pull request text", () => {
  it("cannot be turned into markdown, mentions or links by what an editor typed", () => {
    const body = pullRequestBody({
      slug: SLUG,
      editorName: "@everyone `x` ![img](https://evil.example/p.png)",
      changes: [{ path: ["title"], label: "Page title", before: "```\n# Heading", after: "````" }],
      number: 5,
    });
    expect(body).toContain("- **Sent by:** ``@everyone `x` ![img](https://evil.example/p.png)``");
    expect(pullRequestBody({ slug: SLUG, editorName: "`Jane`", changes: [], number: 5 })).toContain("- **Sent by:** `` `Jane` ``");
    expect(body).toContain("Before:\n\n````text\n```\n# Heading\n````");
    expect(body).toContain("After:\n\n`````text\n````\n`````");
  });

  it("keeps the title and commit message to one line of plain words", () => {
    expect(pullRequestTitle("  Two\nlines  ")).toBe("Website edit: update the Two lines page");
    expect(commitMessage("T", " Jane\n Editor ")).toBe("Website edit: update the T page\n\nSent from the website editor by Jane Editor.");
  });

  it("names branches by page and UTC day", () => {
    expect(branchName("field-building", new Date("2026-10-15T23:30:00-02:00"))).toBe("cms/field-building-2026-10-16");
    expect(branchName("field-building", NOW, 2)).toBe("cms/field-building-2026-10-15-2");
  });
});

describe("withdrawing", () => {
  async function opened() {
    const result = await publishToGitHub(client(), input());
    if (!result.ok) throw new Error(result.reason);
    return result;
  }

  it("closes the pull request and deletes its branch", async () => {
    const { number, branch } = await opened();
    expect(await withdrawFromGitHub(client(), number, branch)).toEqual({ ok: true, leftBranch: null });
    expect(github.openedPRs[0].state).toBe("closed");
    expect(github.branches).toEqual(["main"]);
  });

  it("cannot take back what was merged", async () => {
    const { number, branch } = await opened();
    github.merge(number);
    expect(await withdrawFromGitHub(client(), number, branch)).toEqual({ ok: false, reason: "merged" });
  });

  it("only deletes the branch of a pull request the reviewer already closed", async () => {
    const { number, branch } = await opened();
    github.close(number);
    expect(await withdrawFromGitHub(client(), number, branch)).toEqual({ ok: true, leftBranch: null });
    expect(writes().filter((r) => r.method === "PATCH" && (r.body as { state?: string }).state)).toEqual([]);
    expect(github.branches).toEqual(["main"]);
  });

  it("changes nothing when closing fails", async () => {
    const { number, branch } = await opened();
    github.failNext(`PATCH /pulls/${number}`);
    expect(await withdrawFromGitHub(client(), number, branch)).toMatchObject({ ok: false, reason: "github" });
    expect(github.openedPRs[0].state).toBe("open");
    expect(github.branches).toContain(branch);
  });

  it("still counts as withdrawn when only the branch could not be deleted", async () => {
    const { number, branch } = await opened();
    github.failNext(`DELETE /git/refs/heads/${branch}`);
    expect(await withdrawFromGitHub(client(), number, branch)).toEqual({ ok: true, leftBranch: branch });
    expect(github.openedPRs[0].state).toBe("closed");
  });

  it("lets an error that is not GitHub's through when deleting the branch", async () => {
    const { number, branch } = await opened();
    const real = client();
    const c: GitHubClient = Object.assign(Object.create(real), { deleteBranch: () => Promise.reject(new TypeError("bug")) });
    await expect(withdrawFromGitHub(c, number, branch)).rejects.toThrow("bug");
  });
});

describe("reading what became of a pull request", () => {
  async function opened() {
    const result = await publishToGitHub(client(), input());
    if (!result.ok) throw new Error(result.reason);
    return result.number;
  }

  it("is open while it waits", async () => {
    expect(await readOutcome(client(), await opened(), SLUG)).toEqual({ state: "open" });
  });

  it("is merged, with the merged file's blob id", async () => {
    const number = await opened();
    github.merge(number, new Date("2026-10-16T08:00:00Z"));
    const { contentHash } = await import("./content-files");
    expect(await readOutcome(client(), number, SLUG)).toEqual({ state: "merged", at: new Date("2026-10-16T08:00:00Z"), mergedHash: contentHash(EXPECTED_TEXT) });
  });

  it("is closed, with the reviewer's last comment", async () => {
    const number = await opened();
    github.close(number, { comment: "Please shorten the title.", at: new Date("2026-10-16T08:00:00Z") });
    expect(await readOutcome(client(), number, SLUG)).toEqual({
      state: "closed",
      at: new Date("2026-10-16T08:00:00Z"),
      comment: { author: "reviewer", body: "Please shorten the title.", at: new Date("2026-10-16T08:00:00Z") },
    });
  });

  it("copes with GitHub leaving out the merge commit and times", async () => {
    const c: GitHubClient = Object.assign(Object.create(client()), {
      getPullRequest: async () => ({ number: 1, url: "", state: "closed", merged: true, mergedAt: null, closedAt: null, mergeCommitSha: null, head: "x" }),
    });
    expect(await readOutcome(c, 1, SLUG)).toEqual({ state: "merged", at: NOW, mergedHash: null });
    const closed: GitHubClient = Object.assign(Object.create(client()), {
      getPullRequest: async () => ({ number: 1, url: "", state: "closed", merged: false, mergedAt: null, closedAt: null, mergeCommitSha: null, head: "x" }),
      lastComment: async () => null,
    });
    expect(await readOutcome(closed, 1, SLUG)).toEqual({ state: "closed", at: NOW, comment: null });
  });

  it("passes on GitHub's errors", async () => {
    github.failNext("GET /pulls/9", { status: 404 });
    await expect(readOutcome(client(), 9, SLUG)).rejects.toBeInstanceOf(GitHubError);
  });
});
