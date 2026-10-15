import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { changedRoutes, routeFor } from "./indexnow.mjs";

describe("routeFor", () => {
  it.each([
    ["src/app/page.tsx", ""],
    ["src/app/mep-outreach/page.tsx", "mep-outreach"],
    ["src/app/privacy-policy/page.tsx", "privacy-policy"],
    ["content/home.json", ""],
    ["content/field-building.json", "field-building"],
    ["content/a-new-page.json", "a-new-page"],
  ])("maps %s to %j", (file, route) => {
    expect(routeFor(file)).toBe(route);
  });

  it.each([
    "src/app/layout.tsx",
    "src/app/admin/cms/page.tsx",
    "src/app/apply/success/page.tsx",
    "src/app/privacy-policy/[locale]/page.tsx",
    "src/app/[slug]/page.tsx",
    "content/_redirects.json",
    "content/Bad.json",
    "content/nested/page.json",
    "content/notes.md",
  ])("maps %s to no page", (file) => {
    expect(routeFor(file)).toBeNull();
  });
});

describe("changedRoutes", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "indexnow-"));
  afterAll(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), text);
  };
  const commit = () => {
    git("add", "-A");
    git("-c", "user.name=T", "-c", "user.email=t@example.com", "commit", "-q", "-m", "x");
    return git("rev-parse", "HEAD");
  };

  git("init", "-q");
  write("content/field-building.json", "{}");
  write("content/old-page.json", "{}");
  write("src/app/mep-outreach/page.tsx", "");
  const before = commit();
  write("content/field-building.json", '{"changed":true}');
  write("content/home.json", "{}");
  write("content/a-new-page.json", "{}");
  write("content/_redirects.json", "{}");
  fs.rmSync(path.join(repo, "content/old-page.json"));
  write("src/app/mep-outreach/page.tsx", "changed");
  write("README.md", "");
  const after = commit();

  it("lists the pages whose content or route file was added or changed, not deleted ones", () => {
    expect(changedRoutes(before, after, repo).sort()).toEqual(["", "a-new-page", "field-building", "mep-outreach"]);
  });

  it("lists nothing for the first push of a branch", () => {
    expect(changedRoutes("0000000000000000000000000000000000000000", after, repo)).toEqual([]);
    expect(changedRoutes(undefined, after, repo)).toEqual([]);
  });
});
