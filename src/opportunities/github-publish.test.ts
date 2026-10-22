import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOT_LOGIN, github, githubEnv } from "../../test/fakes/github";
import { GitHubAppClient, type GitHubClient } from "../cms/github";
import { gitHubSetup } from "../cms/github-config";
import { opportunityFilePath, printOpportunity } from "./files";
import { opportunitySchema } from "./schema";
import {
  branchName,
  createOpportunity,
  createPullRequestTitle,
  deleteOpportunity,
  deletePullRequestTitle,
  importOpportunity,
  importPullRequestTitle,
  MAX_BRANCH_ATTEMPTS,
  updateOpportunity,
  updatePullRequestTitle,
} from "./github-publish";
import type { Opportunity } from "./types";

const NOW = new Date("2026-10-22T12:00:00Z");

function client(): GitHubClient {
  const setup = gitHubSetup(githubEnv());
  if (!setup.ok) throw new Error(setup.problem);
  return new GitHubAppClient(setup.config);
}

const JOB: Opportunity = {
  slug: "acme-job",
  type: "job",
  title: "Acme Job",
  org: "Acme",
  summary: "A short summary.",
  description: "A longer description.",
  location: "Remote",
  remote: true,
  applyUrl: "https://example.com/apply",
  publishedAt: "2026-10-22",
};

const PATH = opportunityFilePath(JOB.slug);
/** The requests that would change anything on GitHub. */
const writes = () => github.requests.filter((r) => r.method !== "GET" && !r.path.endsWith("/access_tokens"));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

describe("createOpportunity", () => {
  it("opens one pull request from opportunities/<slug>-<date> adding only the opportunity's file", async () => {
    const result = await createOpportunity(client(), { opportunity: JOB, editorName: "Jane Editor", now: NOW });
    expect(result).toEqual({ ok: true, number: 1, url: "https://github.com/Law-for-AI-Safety/lawforaisafety.org/pull/1", branch: "opportunities/acme-job-2026-10-22" });

    const [pr] = github.openedPRs;
    expect(pr).toMatchObject({ head: "opportunities/acme-job-2026-10-22", base: "main", state: "open" });
    expect(pr.files).toEqual({ [PATH]: printOpportunity(JOB) });
    expect(pr.title).toBe("Add opportunity: Acme Job");
    expect(pr.commits).toEqual([{ message: "Add opportunity: Acme Job\n\nSent from the admin opportunities page by Jane Editor.", author: BOT_LOGIN }]);
  });

  it("refuses an opportunity that fails the schema", async () => {
    const result = await createOpportunity(client(), { opportunity: { ...JOB, title: "" }, editorName: "Jane", now: NOW });
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expect(writes()).toEqual([]);
  });

  it("refuses a slug whose file already exists on main", async () => {
    github.fileOnMain(PATH, printOpportunity(JOB));
    const result = await createOpportunity(client(), { opportunity: JOB, editorName: "Jane", now: NOW });
    expect(result).toEqual({ ok: false, reason: "exists" });
    expect(writes()).toEqual([]);
  });

  it("adds a suffix when the branch name is taken, and gives up when every attempt is", async () => {
    const c = client();
    const head = (await c.branchHead("main"))!;
    await c.createBranch("opportunities/acme-job-2026-10-22", head.commit);
    expect(await createOpportunity(c, { opportunity: JOB, editorName: "Jane", now: NOW })).toMatchObject({ ok: true, branch: "opportunities/acme-job-2026-10-22-2" });

    for (let i = 1; i <= MAX_BRANCH_ATTEMPTS; i++) await c.createBranch(branchName("other-job", NOW, i), head.commit);
    const result = await createOpportunity(c, { opportunity: { ...JOB, slug: "other-job" }, editorName: "Jane", now: NOW });
    expect(result).toMatchObject({ ok: false, reason: "github", step: "branch", leftBranch: null });
  });

  it("deletes the branch and refuses when opening the pull request fails", async () => {
    github.failNext("POST /pulls");
    const result = await createOpportunity(client(), { opportunity: JOB, editorName: "Jane", now: NOW });
    expect(result).toMatchObject({ ok: false, reason: "github", step: "open", leftBranch: null });
    expect(github.branches).toEqual(["main"]);
  });
});

describe("updateOpportunity", () => {
  beforeEach(() => {
    github.fileOnMain(PATH, printOpportunity(JOB));
  });

  it("opens a pull request listing only the changed fields, keeping the slug", async () => {
    const edited = { ...JOB, title: "Acme Senior Job", compensation: "$100k" };
    const result = await updateOpportunity(client(), { slug: JOB.slug, opportunity: edited, editorName: "Jane", now: NOW });
    expect(result).toEqual({ ok: true, number: 1, url: expect.any(String), branch: "opportunities/acme-job-2026-10-22" });

    const [pr] = github.openedPRs;
    expect(pr.files).toEqual({ [PATH]: printOpportunity(opportunitySchema.parse(edited)) });
    expect(pr.title).toBe("Update opportunity: Acme Senior Job");
    expect(pr.body).toContain("### Title");
    expect(pr.body).toContain("Before: `Acme Job`");
    expect(pr.body).toContain("After: `Acme Senior Job`");
    expect(pr.body).toContain("### Compensation");
    expect(pr.body).not.toContain("### Organisation");
  });

  it("refuses an opportunity that fails the schema", async () => {
    const result = await updateOpportunity(client(), { slug: JOB.slug, opportunity: { ...JOB, applyUrl: "nope" }, editorName: "Jane", now: NOW });
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("refuses when the slug has no file on main", async () => {
    const result = await updateOpportunity(client(), { slug: "no-such-slug", opportunity: { ...JOB, slug: "no-such-slug" }, editorName: "Jane", now: NOW });
    expect(result).toEqual({ ok: false, reason: "missing" });
  });

  it("has nothing to send when nothing changed", async () => {
    const result = await updateOpportunity(client(), { slug: JOB.slug, opportunity: JOB, editorName: "Jane", now: NOW });
    expect(result).toEqual({ ok: false, reason: "nothing" });
    expect(writes()).toEqual([]);
  });

  it("keeps the slug in the file even if the caller passes a different one", async () => {
    const result = await updateOpportunity(client(), { slug: JOB.slug, opportunity: { ...JOB, slug: "different-slug", title: "New Title" }, editorName: "Jane", now: NOW });
    expect(result).toMatchObject({ ok: true });
    expect(JSON.parse(github.openedPRs[0].files[PATH]).slug).toBe(JOB.slug);
  });
});

describe("deleteOpportunity", () => {
  it("opens a pull request that removes only the opportunity's file", async () => {
    github.fileOnMain(PATH, printOpportunity(JOB));
    const result = await deleteOpportunity(client(), { slug: JOB.slug, editorName: "Jane", now: NOW });
    expect(result).toMatchObject({ ok: true, branch: "opportunities/acme-job-2026-10-22" });

    const [pr] = github.openedPRs;
    expect(pr.files).toEqual({ [PATH]: "(deleted)" });
    expect(pr.title).toBe("Remove opportunity: Acme Job");
  });

  it("refuses when the slug has no file on main", async () => {
    const result = await deleteOpportunity(client(), { slug: "no-such-slug", editorName: "Jane", now: NOW });
    expect(result).toEqual({ ok: false, reason: "missing" });
  });
});

describe("importOpportunity", () => {
  it("opens a pull request adding a stub file with just the url, at a provisional slug", async () => {
    const result = await importOpportunity(client(), { url: "https://example.com/careers/role", editorName: "Jane", now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");

    expect(result.branch).toMatch(/^opportunities\/pending-example-com-[0-9a-f]+-2026-10-22$/);
    const [pr] = github.openedPRs;
    expect(pr.title).toBe(importPullRequestTitle("https://example.com/careers/role"));
    const [[path, text]] = Object.entries(pr.files);
    expect(path).toMatch(/^content\/opportunities\/pending-example-com-[0-9a-f]+\.json$/);
    expect(JSON.parse(text)).toEqual({ url: "https://example.com/careers/role" });
  });

  it("refuses an invalid url", async () => {
    const result = await importOpportunity(client(), { url: "not a url", editorName: "Jane", now: NOW });
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expect(writes()).toEqual([]);
  });

  it("gives two imports in the same second different branches", async () => {
    const a = await importOpportunity(client(), { url: "https://example.com/a", editorName: "Jane", now: NOW });
    const b = await importOpportunity(client(), { url: "https://example.com/b", editorName: "Jane", now: NOW });
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(a.branch).not.toBe(b.branch);
  });
});

describe("a failure at any step leaves no branch without a pull request", () => {
  it("when reading main fails", async () => {
    github.failNext("GET /git/ref/heads/main");
    const result = await createOpportunity(client(), { opportunity: JOB, editorName: "Jane", now: NOW });
    expect(result).toMatchObject({ ok: false, reason: "github", step: "read_main" });
    expect(github.openedPRs).toEqual([]);
  });

  it("when committing fails", async () => {
    github.failNext("POST /git/trees");
    const result = await createOpportunity(client(), { opportunity: JOB, editorName: "Jane", now: NOW });
    expect(result).toMatchObject({ ok: false, reason: "github", step: "commit" });
    expect(github.branches).toEqual(["main"]);
  });

  it("lets an error that is not GitHub's through", async () => {
    const real = client();
    const broken: GitHubClient = new Proxy(real, {
      get(target, key, receiver) {
        if (key === "branchHead") return () => Promise.reject(new TypeError("bug"));
        const value = Reflect.get(target, key, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(createOpportunity(broken, { opportunity: JOB, editorName: "Jane", now: NOW })).rejects.toThrow("bug");
  });
});

describe("pull request titles", () => {
  it("keep to one line of plain words", () => {
    expect(createPullRequestTitle("  Two\nlines  ")).toBe("Add opportunity: Two lines");
    expect(updatePullRequestTitle("  Two\nlines  ")).toBe("Update opportunity: Two lines");
    expect(deletePullRequestTitle("  Two\nlines  ")).toBe("Remove opportunity: Two lines");
  });

  it("names branches by slug and UTC day", () => {
    expect(branchName("acme-job", new Date("2026-10-22T23:30:00-02:00"))).toBe("opportunities/acme-job-2026-10-23");
    expect(branchName("acme-job", NOW, 2)).toBe("opportunities/acme-job-2026-10-22-2");
  });
});

