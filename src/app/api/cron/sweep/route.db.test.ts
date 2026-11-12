import { beforeEach, describe, expect, it, vi } from "vitest";
import { opportunities } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { indexNow, INDEXNOW_KEY } from "../../../../../test/fakes/indexnow";
import { POST } from "./route";

const sweep = (secret = "test-cron-secret") =>
  POST(new Request("https://lawforaisafety.test/api/cron/sweep", { method: "POST", headers: { Authorization: `Bearer ${secret}` } }));

const LISTING = {
  type: "job" as const,
  title: "Policy Counsel",
  org: "Acme",
  summary: "A short summary.",
  description: "A longer description.",
  locationCountry: "BE",
  remote: false,
  applyUrl: "https://example.com/apply",
  publishedAt: "2026-11-01",
  createdBy: "admin@example.com",
};

beforeEach(async () => {
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  vi.stubEnv("DEPLOY_CONTEXT", "production");
  vi.stubEnv("INDEXNOW_KEY", INDEXNOW_KEY);
  await db.delete(opportunities);
});

describe("the scheduled sweep", () => {
  it("refuses a request without the secret", async () => {
    expect((await sweep("wrong")).status).toBe(401);
    expect(indexNow.pings).toEqual([]);
  });

  it("tells the search engines about listings that closed since the last run", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // The 10 November closing day ended Anywhere on Earth at noon UTC on the 11th.
    vi.setSystemTime(new Date("2026-11-11T14:00:00Z"));
    await db.insert(opportunities).values([
      { ...LISTING, slug: "just-closed", deadline: "2026-11-10" },
      { ...LISTING, slug: "closed-yesterday", deadline: "2026-11-09" },
    ]);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await sweep();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ closedOpportunities: 1 });
    expect(indexNow.urls()).toEqual(["https://lawforaisafety.org/opportunities/just-closed", "https://lawforaisafety.org/opportunities"]);
  });
});
