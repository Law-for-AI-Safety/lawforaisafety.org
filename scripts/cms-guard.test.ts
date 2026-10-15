import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkPullRequest, isBot, main } from "./cms-guard.mjs";

/**
 * The CMS guard (.github/workflows/cms-guard.yml): the rules on their own, then the whole
 * script against a real git repository made for each test.
 */

const BOT = "lais-cms[bot]";
const bot = { name: BOT, email: `123456+${BOT}@users.noreply.github.com` };
const owner = { name: "Owner", email: "owner@example.com" };
const commit = (who: { name: string; email: string }, files: string[], committer = who) => ({ sha: "a".repeat(40), author: who, committer, files });

describe("isBot", () => {
  it("knows the bot by its name or its noreply email, in any case", () => {
    expect(isBot(bot, BOT)).toBe(true);
    expect(isBot({ name: "Someone", email: `${BOT}@users.noreply.github.com` }, BOT)).toBe(true);
    expect(isBot({ name: "LAIS-CMS[BOT]", email: "x@example.com" }, BOT)).toBe(true);
    expect(isBot(owner, BOT)).toBe(false);
    expect(isBot({ name: "x", email: `99+other[bot]@users.noreply.github.com` }, BOT)).toBe(false);
  });
});

describe("checkPullRequest", () => {
  const pr = { botLogin: BOT, prAuthor: BOT, headRef: "cms/field-building-2026-10-15" };

  it("passes the bot's content-only commits from a cms/ branch", () => {
    expect(checkPullRequest({ ...pr, commits: [commit(bot, ["content/field-building.json"])] })).toEqual([]);
  });

  it("fails a bot commit that changes anything outside content/", () => {
    expect(checkPullRequest({ ...pr, commits: [commit(bot, ["content/a.json", "src/app/page.tsx", "package.json"])] })).toEqual([
      `Commit aaaaaaaaaaaa by ${BOT} changes files outside content/: src/app/page.tsx, package.json`,
    ]);
  });

  it("counts a commit the bot only committed, or only authored", () => {
    expect(checkPullRequest({ ...pr, commits: [commit(owner, ["src/x.ts"], bot)] })).toHaveLength(1);
    expect(checkPullRequest({ ...pr, commits: [commit(bot, ["src/x.ts"], owner)] })).toHaveLength(1);
  });

  it("does not restrict maintainers' commits, on a CMS branch or anywhere else", () => {
    expect(checkPullRequest({ ...pr, commits: [commit(bot, ["content/a.json"]), commit(owner, ["src/cms/blocks/Hero.tsx"])] })).toEqual([]);
    expect(checkPullRequest({ ...pr, prAuthor: "owner", headRef: "hturnbull93/cms-w5", commits: [commit(owner, [".github/workflows/ci.yml"])] })).toEqual([]);
  });

  it("fails a pull request the bot opened from a branch outside cms/", () => {
    expect(checkPullRequest({ ...pr, headRef: "main-fix", commits: [commit(bot, ["content/a.json"])] })).toEqual([
      `${BOT} opened this pull request from main-fix, which is not a cms/* branch.`,
    ]);
    expect(checkPullRequest({ ...pr, prAuthor: "LAIS-CMS[bot]", headRef: "content/x", commits: [] })).toHaveLength(1);
  });

  it("does not treat a directory merely starting with content as content/", () => {
    expect(checkPullRequest({ ...pr, commits: [commit(bot, ["content-evil/x.json", "contents/x.json"])] })).toHaveLength(1);
  });

  it("fails closed when the bot's login is not configured", () => {
    for (const botLogin of ["", "  "]) {
      expect(checkPullRequest({ ...pr, botLogin, commits: [] })).toEqual([expect.stringMatching(/^CMS_BOT_LOGIN is not set/)]);
    }
  });
});

describe("the script, on a real repository", () => {
  let dir: string;
  const run = (args: string[], who = owner) =>
    execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_AUTHOR_NAME: who.name,
        GIT_AUTHOR_EMAIL: who.email,
        GIT_COMMITTER_NAME: who.name,
        GIT_COMMITTER_EMAIL: who.email,
      },
    }).trim();
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  };
  const commitAs = (who: typeof owner, files: Record<string, string | null>, message = "change") => {
    for (const [file, text] of Object.entries(files)) {
      if (text === null) run(["rm", "-q", file], who);
      else write(file, text);
    }
    run(["add", "-A"], who);
    run(["commit", "-q", "--no-gpg-sign", "--allow-empty", "-m", message], who);
    return run(["rev-parse", "HEAD"]);
  };
  const guard = (env: Record<string, string>) => {
    const lines: string[] = [];
    const code = main({ CMS_BOT_LOGIN: BOT, PR_AUTHOR: BOT, HEAD_REF: "cms/page-2026-10-15", ...env }, dir, (line) => lines.push(line));
    return { code, lines };
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cms-guard-"));
    run(["init", "-q", "-b", "main"]);
    commitAs(owner, { "content/page.json": "{}\n", "content/x.json": "{}\n", "src/app.ts": "1\n" }, "base");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("passes the bot's content change and a maintainer's code fix on top", () => {
    const base = run(["rev-parse", "HEAD"]);
    commitAs(bot, { "content/page.json": "{ \"a\": 1 }\n" });
    const head = commitAs(owner, { "src/app.ts": "2\n" });
    expect(guard({ BASE_SHA: base, HEAD_SHA: head })).toEqual({
      code: 0,
      lines: [`CMS guard: 2 commit(s) checked; nothing by ${BOT} outside content/.`],
    });
  });

  it("fails the bot's code change, a deletion, and a rename out of content/", () => {
    const base = run(["rev-parse", "HEAD"]);
    commitAs(bot, { "src/app.ts": "evil\n" });
    commitAs(bot, { "content/page.json": null });
    run(["mv", "content/x.json", "x.json"], bot);
    const head = commitAs(bot, {});
    const { code, lines } = guard({ BASE_SHA: base, HEAD_SHA: head });
    expect(code).toBe(1);
    expect(lines).toEqual([
      expect.stringMatching(/^::error::Commit [0-9a-f]{12} by lais-cms\[bot\] changes files outside content\/: src\/app\.ts$/),
      expect.stringMatching(/^::error::Commit [0-9a-f]{12} by lais-cms\[bot\] changes files outside content\/: x\.json$/),
    ]);
  });

  it("fails a bot merge commit that brings in code", () => {
    const base = run(["rev-parse", "HEAD"]);
    run(["checkout", "-q", "-b", "other"]);
    commitAs(owner, { "src/other.ts": "x\n" });
    run(["checkout", "-q", "main"]);
    commitAs(bot, { "content/page.json": "{ \"b\": 1 }\n" });
    run(["merge", "-q", "--no-ff", "--no-gpg-sign", "-m", "merge", "other"], bot);
    const head = run(["rev-parse", "HEAD"]);
    const { code, lines } = guard({ BASE_SHA: base, HEAD_SHA: head });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("src/other.ts");
  });

  it("fails closed without the bot login, and without the commits to check", () => {
    const base = run(["rev-parse", "HEAD"]);
    expect(guard({ CMS_BOT_LOGIN: "", BASE_SHA: base, HEAD_SHA: base }).code).toBe(1);
    expect(guard({ BASE_SHA: "", HEAD_SHA: base })).toEqual({ code: 1, lines: ["::error::The CMS guard needs BASE_SHA."] });
  });

  it("fails when git cannot find the commits", () => {
    expect(() => guard({ BASE_SHA: "0".repeat(40), HEAD_SHA: "1".repeat(40) })).toThrow();
  });
});
