import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findPendingSlug,
  finalizeOpportunity,
  isImportBranch,
  listCandidatePRs,
  parseExtractionOutput,
  processCandidate,
  renderFailureComment,
  renderSplitComment,
  renderSuccessComment,
  type Run,
} from "./run-opportunity-imports";
import type { Extraction } from "../src/opportunities/schema";
import type { Opportunity } from "../src/opportunities/types";

const NOW = new Date("2026-10-22T12:00:00Z");

const EXTRACTION: Extraction = {
  type: "job",
  title: "Senior Engineer",
  org: "Acme",
  summary: "A short summary.",
  description: "A longer description.",
  location: "Remote",
  remote: true,
  applyUrl: "https://example.com/apply",
};

function fakeRun(responses: Record<string, { stdout: string; stderr?: string } | "throw">): Run {
  const calls: string[] = [];
  const run = (async (cmd: string, args: string[]) => {
    const key = `${cmd} ${args.join(" ")}`;
    calls.push(key);
    const match = Object.keys(responses).find((k) => key.startsWith(k));
    const outcome = match ? responses[match] : undefined;
    if (outcome === "throw") throw new Error(`command failed: ${key}`);
    if (!outcome) throw new Error(`unexpected command: ${key}`);
    return { stdout: outcome.stdout, stderr: outcome.stderr ?? "" };
  }) as Run;
  (run as Run & { calls: string[] }).calls = calls;
  return run as Run & { calls: string[] };
}

describe("isImportBranch", () => {
  it("matches the branch names importOpportunity creates", () => {
    expect(isImportBranch("opportunities/pending-example-com-a1b2c3d4-2026-10-22")).toBe(true);
  });

  it("does not match a create/update/delete branch", () => {
    expect(isImportBranch("opportunities/acme-job-2026-10-22")).toBe(false);
    expect(isImportBranch("cms/field-building-2026-10-22")).toBe(false);
  });
});

describe("listCandidatePRs", () => {
  it("keeps only PRs on an import branch", async () => {
    const run = fakeRun({
      "gh pr list": {
        stdout: JSON.stringify([
          { number: 1, headRefName: "opportunities/pending-example-com-aaaa-2026-10-22" },
          { number: 2, headRefName: "opportunities/acme-job-2026-10-22" },
        ]),
      },
    });
    expect(await listCandidatePRs(run)).toEqual([{ number: 1, branch: "opportunities/pending-example-com-aaaa-2026-10-22" }]);
  });
});

describe("findPendingSlug", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "opportunities-pending-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("finds the one pending stub file", () => {
    fs.writeFileSync(path.join(dir, "pending-example-com-aaaa.json"), "{}");
    expect(findPendingSlug(dir)).toBe("pending-example-com-aaaa");
  });

  it("is null when there's no pending file", () => {
    fs.writeFileSync(path.join(dir, "acme-job.json"), "{}");
    expect(findPendingSlug(dir)).toBeNull();
  });

  it("is null when there's more than one", () => {
    fs.writeFileSync(path.join(dir, "pending-a.json"), "{}");
    fs.writeFileSync(path.join(dir, "pending-b.json"), "{}");
    expect(findPendingSlug(dir)).toBeNull();
  });
});

describe("parseExtractionOutput", () => {
  it("parses a single-item structured_output", () => {
    const result = parseExtractionOutput(JSON.stringify({ structured_output: [EXTRACTION] }));
    expect(result).toEqual({ ok: true, data: [EXTRACTION] });
  });

  it("parses a multi-item structured_output", () => {
    const second = { ...EXTRACTION, title: "Other Role" };
    const result = parseExtractionOutput(JSON.stringify({ structured_output: [EXTRACTION, second] }));
    expect(result).toEqual({ ok: true, data: [EXTRACTION, second] });
  });

  it("fails on invalid JSON", () => {
    expect(parseExtractionOutput("not json")).toEqual({ ok: false, error: expect.stringContaining("valid JSON") });
  });

  it("fails when there's no structured_output", () => {
    expect(parseExtractionOutput(JSON.stringify({ result: "text" }))).toEqual({ ok: false, error: expect.stringContaining("no structured_output") });
  });

  it("fails when an item in structured_output doesn't match the schema", () => {
    const result = parseExtractionOutput(JSON.stringify({ structured_output: [{ ...EXTRACTION, title: "" }] }));
    expect(result).toEqual({ ok: false, error: expect.stringContaining("failed validation") });
  });

  it("fails when structured_output is an empty array", () => {
    const result = parseExtractionOutput(JSON.stringify({ structured_output: [] }));
    expect(result).toEqual({ ok: false, error: expect.stringContaining("failed validation") });
  });
});

describe("finalizeOpportunity", () => {
  it("fills in slug, sourceUrl and publishedAt", () => {
    const opportunity = finalizeOpportunity(EXTRACTION, "https://example.com/careers/role", NOW, new Set());
    expect(opportunity).toEqual({
      ...EXTRACTION,
      slug: "acme-senior-engineer",
      sourceUrl: "https://example.com/careers/role",
      publishedAt: "2026-10-22",
    });
  });

  it("dedupes the slug against what's already published", () => {
    const opportunity = finalizeOpportunity(EXTRACTION, "https://example.com/careers/role", NOW, new Set(["acme-senior-engineer"]));
    expect(opportunity.slug).toBe("acme-senior-engineer-2");
  });
});

describe("renderSuccessComment / renderFailureComment", () => {
  const opportunity: Opportunity = { ...finalizeOpportunity(EXTRACTION, "https://example.com/careers/role", NOW, new Set()), deadline: "2026-12-01" };

  it("renders the listing's key facts", () => {
    const comment = renderSuccessComment(opportunity);
    expect(comment).toContain("Senior Engineer");
    expect(comment).toContain("Acme");
    expect(comment).toContain("Apply by: 2026-12-01");
    expect(comment).toContain("https://example.com/apply");
  });

  it("renders a failure with the error and no listing facts", () => {
    const comment = renderFailureComment("https://example.com/careers/role", "the page returned a 404");
    expect(comment).toContain("https://example.com/careers/role");
    expect(comment).toContain("the page returned a 404");
  });
});

describe("processCandidate", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "opportunities-process-"));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  const candidate = { number: 42, branch: "opportunities/pending-example-com-aaaa-2026-10-22" };

  it("skips when there's no single pending stub file", async () => {
    const run = fakeRun({});
    const result = await processCandidate(candidate, { run, dir, existingSlugs: new Set(), now: NOW });
    expect(result).toEqual({ ok: false, detail: expect.stringContaining("no single pending stub file") });
  });

  it("extracts, writes the real file, commits, pushes and comments on success", async () => {
    fs.writeFileSync(path.join(dir, "pending-example-com-aaaa.json"), JSON.stringify({ url: "https://example.com/careers/role" }));
    const run = fakeRun({
      claude: { stdout: JSON.stringify({ structured_output: [EXTRACTION] }) },
      "git add": { stdout: "" },
      "git commit": { stdout: "" },
      "git push": { stdout: "" },
      "gh pr comment": { stdout: "" },
    });

    const result = await processCandidate(candidate, { run, dir, existingSlugs: new Set(), now: NOW });
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(dir, "pending-example-com-aaaa.json"))).toBe(false);
    const written = JSON.parse(fs.readFileSync(path.join(dir, "acme-senior-engineer.json"), "utf8"));
    expect(written).toMatchObject({ slug: "acme-senior-engineer", sourceUrl: "https://example.com/careers/role", publishedAt: "2026-10-22" });
    expect((run as Run & { calls: string[] }).calls.some((c) => c.startsWith("git push origin opportunities/pending"))).toBe(true);
    expect((run as Run & { calls: string[] }).calls.some((c) => c.startsWith("gh pr comment 42"))).toBe(true);
  });

  it("leaves the stub and comments the failure when extraction fails", async () => {
    fs.writeFileSync(path.join(dir, "pending-example-com-aaaa.json"), JSON.stringify({ url: "https://example.com/careers/role" }));
    const run = fakeRun({
      claude: "throw",
      "gh pr comment": { stdout: "" },
    });

    const result = await processCandidate(candidate, { run, dir, existingSlugs: new Set(), now: NOW });
    expect(result.ok).toBe(false);
    expect(fs.existsSync(path.join(dir, "pending-example-com-aaaa.json"))).toBe(true);
    expect((run as Run & { calls: string[] }).calls.some((c) => c.startsWith("gh pr comment 42"))).toBe(true);
  });

  it("skips when the stub file was already filled in by a previous, interrupted run", async () => {
    fs.writeFileSync(path.join(dir, "pending-example-com-aaaa.json"), JSON.stringify({ ...EXTRACTION, slug: "x", publishedAt: "2026-10-22" }));
    const run = fakeRun({});
    const result = await processCandidate(candidate, { run, dir, existingSlugs: new Set(), now: NOW });
    expect(result).toEqual({ ok: false, detail: expect.stringContaining("no longer a stub") });
  });

  it("splits a page listing several opportunities into one pull request each, and closes the stub PR", async () => {
    fs.writeFileSync(path.join(dir, "pending-example-com-aaaa.json"), JSON.stringify({ url: "https://example.com/careers" }));
    const itemA = { ...EXTRACTION, title: "Engineer A" };
    const itemB = { ...EXTRACTION, title: "Engineer B" };
    const run = fakeRun({
      claude: { stdout: JSON.stringify({ structured_output: [itemA, itemB] }) },
      "git checkout": { stdout: "" },
      "git ls-remote": "throw",
      "git add": { stdout: "" },
      "git commit": { stdout: "" },
      "git push": { stdout: "" },
      "gh pr create": { stdout: "https://github.com/example/repo/pull/101\n" },
      "gh pr comment": { stdout: "" },
      "gh pr close": { stdout: "" },
    });

    const result = await processCandidate(candidate, { run, dir, existingSlugs: new Set(), now: NOW });
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("split into 2 opportunity pull request(s)");

    expect(fs.existsSync(path.join(dir, "pending-example-com-aaaa.json"))).toBe(true);
    const slugA = finalizeOpportunity(itemA, "https://example.com/careers", NOW, new Set()).slug;
    const slugB = finalizeOpportunity(itemB, "https://example.com/careers", NOW, new Set([slugA])).slug;
    expect(JSON.parse(fs.readFileSync(path.join(dir, `${slugA}.json`), "utf8"))).toMatchObject({ title: "Engineer A" });
    expect(JSON.parse(fs.readFileSync(path.join(dir, `${slugB}.json`), "utf8"))).toMatchObject({ title: "Engineer B" });

    const calls = (run as Run & { calls: string[] }).calls;
    expect(calls.filter((c) => c.startsWith("gh pr create")).length).toBe(2);
    expect(calls.some((c) => c.startsWith("gh pr close 42"))).toBe(true);
    const commentCall = calls.find((c) => c.startsWith("gh pr comment 42"));
    expect(commentCall).toContain("Engineer A");
    expect(commentCall).toContain("Engineer B");
  });
});

describe("renderSplitComment", () => {
  it("lists each opened pull request and says the original is closing", () => {
    const opportunity = finalizeOpportunity(EXTRACTION, "https://example.com/careers", NOW, new Set());
    const comment = renderSplitComment("https://example.com/careers", [{ opportunity, prUrl: "https://github.com/example/repo/pull/101" }]);
    expect(comment).toContain("listed 1 separate opportunities");
    expect(comment).toContain("[Senior Engineer at Acme](https://github.com/example/repo/pull/101)");
    expect(comment).toContain("Closing this pull request");
  });
});
