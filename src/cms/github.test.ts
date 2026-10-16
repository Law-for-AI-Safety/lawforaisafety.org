import { decodeJwt, decodeProtectedHeader } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { github, githubEnv, BOT_LOGIN } from "../../test/fakes/github";
import { contentHash } from "./content-files";
import { GitHubAppClient, GitHubError, gitHubClientFor, TOKEN_RENEW_MARGIN_MS } from "./github";
import { gitHubSetup } from "./github-config";

/**
 * The GitHub App client against the fake GitHub, which checks the app's JWT and the
 * installation token as GitHub does.
 */

function config() {
  const setup = gitHubSetup(githubEnv());
  if (!setup.ok) throw new Error(setup.problem);
  return setup.config;
}

const client = () => new GitHubAppClient(config());
const tokenRequests = () => github.requests.filter((r) => r.path.endsWith("/access_tokens"));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
});

describe("signing in as the app", () => {
  it("asks for an installation token with a short-lived RS256 JWT, narrowed to this repo", async () => {
    const seen: string[] = [];
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      seen.push(new Headers(init?.headers).get("authorization") ?? "");
      return realFetch(input, init);
    });
    await client().branchHead("main");

    const jwt = seen[0].replace("Bearer ", "");
    expect(decodeProtectedHeader(jwt)).toEqual({ alg: "RS256" });
    const claims = decodeJwt(jwt);
    expect(claims.iss).toBe("424242");
    expect(claims.iat).toBe(Date.parse("2026-10-15T11:59:00Z") / 1000);
    expect(claims.exp).toBe(Date.parse("2026-10-15T12:09:00Z") / 1000);
    expect(tokenRequests()).toEqual([
      {
        method: "POST",
        path: "/app/installations/777/access_tokens",
        body: { repositories: ["lawforaisafety.org"], permissions: { contents: "write", pull_requests: "write" } },
      },
    ]);
    expect(seen[1]).toBe("Bearer ghs_fake1");
  });

  it("reuses the token until shortly before it expires, then gets a new one", async () => {
    const c = client();
    await c.branchHead("main");
    await c.branchHead("main");
    expect(github.tokensIssued).toBe(1);

    // The fake's tokens last an hour.
    vi.setSystemTime(Date.now() + 60 * 60 * 1000 - TOKEN_RENEW_MARGIN_MS - 1000);
    await c.branchHead("main");
    expect(github.tokensIssued).toBe(1);

    vi.setSystemTime(Date.now() + 2000);
    await c.branchHead("main");
    expect(github.tokensIssued).toBe(2);
  });

  it("gets a new token once when GitHub refuses the cached one", async () => {
    const c = client();
    await c.branchHead("main");
    github.revokeTokens();
    expect(await c.branchHead("main")).not.toBeNull();
    expect(github.tokensIssued).toBe(2);
  });

  it("gives up when a fresh token is refused too", async () => {
    github.failNext("GET /git/ref/heads/main", { status: 401 });
    github.failNext("GET /git/ref/heads/main", { status: 401 });
    await expect(client().branchHead("main")).rejects.toMatchObject({ status: 401 });
  });

  it("is refused by GitHub when the key is not the app's", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const other = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    const c = new GitHubAppClient({ ...config(), privateKey: other.privateKey });
    await expect(c.branchHead("main")).rejects.toThrow("GitHub refused POST /app/installations/777/access_tokens: A JSON web token could not be decoded");
  });

  it("says the key is not a key without quoting it", async () => {
    const c = new GitHubAppClient({ ...config(), privateKey: "-----BEGIN RSA PRIVATE KEY-----\nsecret-material\n-----END RSA PRIVATE KEY-----" });
    const error = await c.branchHead("main").catch((e: Error) => e);
    expect(error).toBeInstanceOf(GitHubError);
    expect((error as Error).message).toBe("GITHUB_APP_PRIVATE_KEY is not a valid PEM private key");
  });

  it("refuses a token response it does not understand", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ token: 5 }, { status: 201 }));
    await expect(client().branchHead("main")).rejects.toThrow("installation token response");
  });

  it("never puts the key or a token in an error message", async () => {
    github.failNext("GET /git/ref/heads/main", { status: 500 });
    const error = (await client().branchHead("main").catch((e: Error) => e)) as Error;
    expect(error.message).toBe("GitHub refused GET /repos/Law-for-AI-Safety/lawforaisafety.org/git/ref/heads/main: Server Error");
    expect(error.message).not.toMatch(/ghs_|PRIVATE KEY/);
  });

  it("reports GitHub being unreachable, and a reply that is not JSON", async () => {
    github.failNext("GET /git/ref/heads/main", { kind: "network" });
    await expect(client().branchHead("main")).rejects.toMatchObject({ status: 0, message: expect.stringMatching(/^Could not reach GitHub \(GET .*\): fetch failed$/) });

    const c = client();
    await c.branchHead("main");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(c.branchHead("main")).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/: HTTP 502$/) });
  });

  it("shares one client, and so one token, per configuration", () => {
    expect(gitHubClientFor(config())).toBe(gitHubClientFor(config()));
    expect(gitHubClientFor({ ...config(), repo: "other" })).not.toBe(gitHubClientFor(config()));
  });
});

describe("the repo", () => {
  it("reads branches, files and blobs", async () => {
    const sha = github.fileOnMain("content/a.json", "{ \"a\": \"é\" }\n");
    const c = client();
    const head = await c.branchHead("main");
    expect(head).toEqual({ commit: expect.stringMatching(/^[0-9a-f]{40}$/), tree: expect.stringMatching(/^[0-9a-f]{40}$/) });
    expect(await c.readFile("content/a.json", head!.commit)).toEqual({ sha, text: "{ \"a\": \"é\" }\n" });
    expect(sha).toBe(contentHash("{ \"a\": \"é\" }\n"));
    expect(await c.readBlob(sha)).toBe("{ \"a\": \"é\" }\n");

    expect(await c.branchHead("nope")).toBeNull();
    expect(await c.readFile("content/missing.json", "main")).toBeNull();
    expect(await c.readBlob("0".repeat(40))).toBeNull();
  });

  it("refuses a path that is a directory rather than a file", async () => {
    const c = client();
    await c.branchHead("main");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json([{ type: "file" }]));
    await expect(c.readFile("content", "main")).rejects.toThrow("GitHub did not send content as a file's contents");
  });

  it("commits one file, then creates, refuses to recreate, and deletes a branch", async () => {
    github.fileOnMain("content/a.json", "old\n");
    const c = client();
    const head = (await c.branchHead("main"))!;
    const commit = await c.createCommit({ parent: head.commit, baseTree: head.tree, path: "content/a.json", text: "new\n", message: "Change a" });
    expect(github.branches).toEqual(["main"]);

    expect(await c.createBranch("cms/a-2026-10-15", commit)).toBe(true);
    expect(await c.createBranch("cms/a-2026-10-15", commit)).toBe(false);
    expect(github.fileOn("cms/a-2026-10-15", "content/a.json")).toBe("new\n");
    expect(github.fileOn("main", "content/a.json")).toBe("old\n");

    await c.deleteBranch("cms/a-2026-10-15");
    await c.deleteBranch("cms/a-2026-10-15");
    expect(github.branches).toEqual(["main"]);
  });

  it("passes on other refusals to create or delete a branch", async () => {
    const c = client();
    await expect(c.createBranch("cms/x", "f".repeat(40))).rejects.toMatchObject({ status: 422, message: expect.stringContaining("Invalid reference") });
    await expect(c.deleteBranch("main")).rejects.toMatchObject({ status: 422 });
    github.failNext("DELETE /git/refs/heads/cms/x", { status: 404 });
    await expect(c.deleteBranch("cms/x")).resolves.toBeUndefined();
  });

  it("opens, reads, edits and closes a pull request", async () => {
    github.fileOnMain("content/a.json", "old\n");
    const c = client();
    const head = (await c.branchHead("main"))!;
    const commit = await c.createCommit({ parent: head.commit, baseTree: head.tree, path: "content/a.json", text: "new\n", message: "Change a" });
    await c.createBranch("cms/a", commit);
    const opened = await c.openPullRequest({ head: "cms/a", base: "main", title: "T", body: "B" });
    expect(opened).toEqual({ number: 1, url: "https://github.com/Law-for-AI-Safety/lawforaisafety.org/pull/1" });

    await c.updatePullRequestBody(1, "B2");
    expect(github.openedPRs[0]).toMatchObject({ title: "T", body: "B2", head: "cms/a", base: "main", files: { "content/a.json": "new\n" } });
    expect(github.openedPRs[0].commits).toEqual([{ message: "Change a", author: BOT_LOGIN }]);
    expect(await c.getPullRequest(1)).toEqual({
      number: 1,
      url: opened.url,
      state: "open",
      merged: false,
      mergedAt: null,
      closedAt: null,
      mergeCommitSha: null,
      head: "cms/a",
    });

    await c.closePullRequest(1);
    expect(await c.getPullRequest(1)).toMatchObject({ state: "closed", merged: false, closedAt: new Date("2026-10-15T12:00:00Z") });
  });

  it("reads a merged pull request", async () => {
    github.fileOnMain("content/a.json", "old\n");
    const c = client();
    const head = (await c.branchHead("main"))!;
    await c.createBranch("cms/a", await c.createCommit({ parent: head.commit, baseTree: head.tree, path: "content/a.json", text: "new\n", message: "m" }));
    await c.openPullRequest({ head: "cms/a", base: "main", title: "T", body: "B" });
    const sha = github.merge(1, new Date("2026-10-16T09:00:00Z"));
    expect(await c.getPullRequest(1)).toMatchObject({ state: "closed", merged: true, mergedAt: new Date("2026-10-16T09:00:00Z"), mergeCommitSha: sha });
    expect(github.fileOn("main", "content/a.json")).toBe("new\n");
  });

  it("finds the last thing a person said, across comments, reviews and review comments, leaving out bots", async () => {
    github.fileOnMain("content/a.json", "old\n");
    const c = client();
    const head = (await c.branchHead("main"))!;
    await c.createBranch("cms/a", head.commit);
    await c.openPullRequest({ head: "cms/a", base: "main", title: "T", body: "B" });
    expect(await c.lastComment(1)).toBeNull();

    github.comment(1, "First", { at: new Date("2026-10-15T10:00:00Z") });
    github.review(1, "Looks odd", { at: new Date("2026-10-15T11:00:00Z") });
    github.review(1, "", { at: new Date("2026-10-15T11:30:00Z") });
    github.reviewComment(1, "This line", { at: new Date("2026-10-15T10:30:00Z") });
    github.comment(1, "Deploy preview ready", { by: "netlify[bot]", bot: true, at: new Date("2026-10-15T12:00:00Z") });
    expect(await c.lastComment(1)).toEqual({ author: "reviewer", body: "Looks odd", at: new Date("2026-10-15T11:00:00Z") });

    github.reviewComment(1, "  Latest  ", { by: "owner", at: new Date("2026-10-15T11:45:00Z") });
    expect(await c.lastComment(1)).toEqual({ author: "owner", body: "Latest", at: new Date("2026-10-15T11:45:00Z") });
  });

  it("skips comments with no author or time", async () => {
    const c = client();
    await c.branchHead("main");
    const list = (items: unknown[]) => Response.json(items);
    const who = { login: "r", type: "User" };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ closed_by: null }))
      .mockResolvedValueOnce(list([{ user: null, author_association: "OWNER", body: "ghost", created_at: "2026-10-15T10:00:00Z" }]))
      .mockResolvedValueOnce(list([{ user: who, author_association: "OWNER", body: "no time", state: "COMMENTED" }]))
      .mockResolvedValueOnce(list([{ user: who, author_association: "OWNER", body: null, created_at: "2026-10-15T10:00:00Z" }]));
    expect(await c.lastComment(1)).toBeNull();
  });

  it("shows only what maintainers, or whoever closed it, said: the repo is public", async () => {
    github.fileOnMain("content/a.json", "old\n");
    const c = client();
    const head = (await c.branchHead("main"))!;
    await c.createBranch("cms/a", head.commit);
    await c.openPullRequest({ head: "cms/a", base: "main", title: "T", body: "B" });
    github.comment(1, "From the owner", { by: "owner", association: "OWNER", at: new Date("2026-10-15T09:00:00Z") });
    github.comment(1, "Spam from a stranger", { by: "stranger", association: "NONE", at: new Date("2026-10-15T10:00:00Z") });
    github.review(1, "A past contributor", { by: "contributor", association: "CONTRIBUTOR", at: new Date("2026-10-15T11:00:00Z") });
    expect(await c.lastComment(1)).toMatchObject({ author: "owner", body: "From the owner" });

    github.reviewComment(1, "A collaborator", { by: "collab", association: "COLLABORATOR", at: new Date("2026-10-15T09:30:00Z") });
    expect(await c.lastComment(1)).toMatchObject({ author: "collab" });

    // Someone outside the repo who could close it (for instance its author) is listened to.
    github.close(1, { comment: "Closing my own", by: "closer", association: "NONE", at: new Date("2026-10-15T12:00:00Z") });
    expect(await c.lastComment(1)).toMatchObject({ author: "closer", body: "Closing my own" });
  });

  it("reads every page of the comments and takes the newest", async () => {
    github.fileOnMain("content/a.json", "old\n");
    const c = client();
    const head = (await c.branchHead("main"))!;
    await c.createBranch("cms/a", head.commit);
    await c.openPullRequest({ head: "cms/a", base: "main", title: "T", body: "B" });
    const start = Date.parse("2026-10-01T00:00:00Z");
    for (let i = 0; i < 250; i++) github.comment(1, `Comment ${i}`, { at: new Date(start + i * 60_000) });
    expect(await c.lastComment(1)).toMatchObject({ body: "Comment 249" });
    expect(github.requests.filter((r) => r.path.includes("/issues/1/comments")).map((r) => r.path)).toEqual([
      "/repos/Law-for-AI-Safety/lawforaisafety.org/issues/1/comments?per_page=100",
      "/repos/Law-for-AI-Safety/lawforaisafety.org/issues/1/comments?per_page=100&page=2",
      "/repos/Law-for-AI-Safety/lawforaisafety.org/issues/1/comments?per_page=100&page=3",
    ]);
  });

  it("does not follow a next page that leads off the API", async () => {
    const c = client();
    await c.branchHead("main");
    const page = (items: unknown[], next?: string) => Response.json(items, { headers: next ? { link: `<${next}>; rel="next"` } : {} });
    const item = (body: string) => ({ user: { login: "o", type: "User" }, author_association: "OWNER", body, created_at: "2026-10-15T10:00:00Z" });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ closed_by: null }))
      .mockResolvedValueOnce(page([item("first")], "https://evil.example/repos/x?page=2"))
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([]));
    expect(await c.lastComment(1)).toMatchObject({ body: "first" });
  });

  it("renews a refused token while reading pages", async () => {
    const c = client();
    await c.branchHead("main");
    github.revokeTokens();
    expect(await c.findPullRequest("cms/none")).toBeNull();
    github.failNext("GET /pulls", { status: 403 });
    await expect(c.findPullRequest("cms/none")).rejects.toMatchObject({ status: 403 });
  });

  it("finds the pull request opened from a branch, open or closed", async () => {
    github.fileOnMain("content/a.json", "old\n");
    const c = client();
    const head = (await c.branchHead("main"))!;
    await c.createBranch("cms/a", head.commit);
    await c.createBranch("cms/b", head.commit);
    await c.openPullRequest({ head: "cms/a", base: "main", title: "A", body: "" });
    await c.openPullRequest({ head: "cms/b", base: "main", title: "B", body: "" });
    github.close(2);
    expect(await c.findPullRequest("cms/b")).toBe(2);
    expect(await c.findPullRequest("cms/a")).toBe(1);
    expect(await c.findPullRequest("cms/c")).toBeNull();
    expect(github.requests.at(-1)!.path).toBe("/repos/Law-for-AI-Safety/lawforaisafety.org/pulls?state=all&head=Law-for-AI-Safety%3Acms%2Fc&per_page=100");
  });

  it("gives up on a request GitHub does not answer in time", async () => {
    const setup = gitHubSetup(githubEnv());
    if (!setup.ok) throw new Error(setup.problem);
    const c = new GitHubAppClient(setup.config, 50);
    github.failNext("GET /git/ref/heads/main", { kind: "hang" });
    await expect(c.branchHead("main")).rejects.toMatchObject({ status: 0, message: expect.stringMatching(/^Could not reach GitHub \(GET .*\): .*(timeout|aborted)/i) });
  });

  it("puts a time limit on every request it sends", async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      signals.push(init?.signal);
      return realFetch(input, init);
    });
    const c = client();
    await c.branchHead("main");
    await c.lastComment(1).catch(() => null);
    expect(signals.length).toBeGreaterThan(3);
    for (const signal of signals) expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("encodes branch names and paths in URLs, keeping their slashes", async () => {
    const c = client();
    await c.readFile("content/a b.json", "cms/x y");
    expect(github.requests.at(-1)!.path).toBe("/repos/Law-for-AI-Safety/lawforaisafety.org/contents/content/a%20b.json?ref=cms%2Fx%20y");
  });
});
