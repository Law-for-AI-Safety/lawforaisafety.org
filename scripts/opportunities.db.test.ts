import { beforeEach, describe, expect, it, vi } from "vitest";
import { opportunities, opportunitiesAuditLog } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { APP_ORIGIN } from "../test/app-fetch";
import { apiKey, runOpportunitiesCommand, USAGE } from "./opportunities";

const KEY = "test-key";
const PUBLISHED = {
  slug: "acme-role",
  type: "job" as const,
  title: "Role",
  org: "Acme",
  summary: "A summary.",
  description: "A description.",
  locationCountry: "GLOBAL",
  remote: true,
  applyUrl: "https://example.com/apply",
  publishedAt: "2026-01-01",
  createdBy: "admin@example.com",
};
const DRAFT = { ...PUBLISHED, slug: "acme-draft", title: "Draft", status: "draft" as const, publishedAt: null };

let printed: string[];
let files: Record<string, string>;

function run(...args: string[]) {
  return runOpportunitiesCommand(args, {
    baseUrl: APP_ORIGIN,
    key: KEY,
    print: (line) => printed.push(line),
    readFile: (path) => files[path],
  });
}

beforeEach(async () => {
  await db.delete(opportunitiesAuditLog);
  await db.delete(opportunities);
  await db.insert(opportunities).values([PUBLISHED, DRAFT]);
  vi.stubEnv("OPPORTUNITIES_API_KEY", KEY);
  printed = [];
  files = {};
});

describe("npm run opportunities", () => {
  it("lists every listing, or only drafts", async () => {
    expect(await run("list")).toBe(0);
    expect(printed.sort()).toEqual(["draft     acme-draft  Draft (Acme)", "published acme-role  Role (Acme)"]);

    printed = [];
    expect(await run("list", "--status", "draft")).toBe(0);
    expect(printed).toEqual(["draft     acme-draft  Draft (Acme)"]);
  });

  it("gets one listing as JSON", async () => {
    expect(await run("get", "acme-draft")).toBe(0);
    expect(JSON.parse(printed[0])).toMatchObject({ slug: "acme-draft", status: "draft" });
  });

  it("creates a listing from a file", async () => {
    files["new.json"] = JSON.stringify({ ...PUBLISHED, slug: undefined, publishedAt: undefined, createdBy: undefined, title: "New", status: "draft" });
    expect(await run("create", "new.json")).toBe(0);
    expect(JSON.parse(printed[0])).toMatchObject({ title: "New", status: "draft" });
  });

  it("updates only the fields in the file", async () => {
    files["edit.json"] = JSON.stringify({ title: "Renamed" });
    expect(await run("update", "acme-role", "edit.json")).toBe(0);
    expect(JSON.parse(printed[0])).toMatchObject({ title: "Renamed", org: "Acme", applyUrl: PUBLISHED.applyUrl });
  });

  it("makes a listing rolling, applied to by email", async () => {
    files["edit.json"] = JSON.stringify({ rolling: true, applyUrl: "join@pauseai.info" });
    expect(await run("update", "acme-role", "edit.json")).toBe(0);
    expect(JSON.parse(printed[0])).toMatchObject({ rolling: true, applyUrl: "mailto:join@pauseai.info" });
  });

  it("publishes a draft", async () => {
    expect(await run("publish", "acme-draft")).toBe(0);
    expect(JSON.parse(printed[0])).toMatchObject({ slug: "acme-draft", status: "published" });
  });

  it("says why a request was refused, and fails", async () => {
    expect(await run("get", "no-such-listing")).toBe(1);
    expect(printed).toEqual(["GET /no-such-listing failed with 404: There is no such listing."]);

    for (const args of [["list", "--status", "closed"], ["create", "bad.json"], ["update", "acme-role", "bad.json"], ["publish", "no-such-listing"]]) {
      files["bad.json"] = JSON.stringify({ title: "" });
      printed = [];
      expect(await run(...args), args.join(" ")).toBe(1);
      expect(printed[0]).toMatch(/failed with 4\d\d: /);
    }
  });

  it("prints its usage for an unknown command or wrong arguments, and never the key", async () => {
    for (const args of [[], ["delete", "acme-role"], ["get"], ["list", "--draft"], ["update", "acme-role"]]) {
      printed = [];
      expect(await run(...args)).toBe(2);
      expect(printed).toEqual([USAGE]);
    }
    expect(USAGE).not.toContain(KEY);
  });
});

describe("apiKey", () => {
  it("takes the key from the environment first, then from .env.local", () => {
    expect(apiKey({ OPPORTUNITIES_API_KEY: "from-env" }, "OPPORTUNITIES_API_KEY=from-file")).toBe("from-env");
    expect(apiKey({}, 'A=1\nOPPORTUNITIES_API_KEY="from-file"\n')).toBe("from-file");
    expect(apiKey({}, "A=1\n")).toBeUndefined();
    expect(apiKey({}, null)).toBeUndefined();
  });
});
