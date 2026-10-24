import { beforeEach, describe, expect, it } from "vitest";
import { opportunities } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { getOpportunities, getOpportunityBySlug } from "./data";

const FIXTURE = {
  slug: "fixture-job",
  type: "job" as const,
  title: "Fixture Job",
  org: "Fixture Org",
  summary: "A short summary.",
  description: "A longer description.",
  locationCountry: "GLOBAL",
  remote: true,
  applyUrl: "https://example.com/apply",
  publishedAt: "2026-01-01",
  createdBy: "admin@example.com",
};

beforeEach(async () => {
  await db.delete(opportunities);
});

describe("getOpportunities / getOpportunityBySlug", () => {
  it("is empty when there are no listings", async () => {
    expect(await getOpportunities()).toEqual([]);
  });

  it("finds a known listing", async () => {
    await db.insert(opportunities).values(FIXTURE);
    const found = await getOpportunityBySlug(FIXTURE.slug);
    expect(found).toMatchObject({ slug: FIXTURE.slug, title: FIXTURE.title, org: FIXTURE.org });
  });

  it("returns null for an unknown slug", async () => {
    expect(await getOpportunityBySlug("no-such-opportunity")).toBeNull();
  });

  it("lists every row", async () => {
    await db.insert(opportunities).values([FIXTURE, { ...FIXTURE, slug: "fixture-job-2", title: "Fixture Job 2" }]);
    const all = await getOpportunities();
    expect(all.map((o) => o.slug).sort()).toEqual(["fixture-job", "fixture-job-2"]);
  });

  it("drops an optional field entirely rather than returning it as null", async () => {
    await db.insert(opportunities).values(FIXTURE);
    const found = await getOpportunityBySlug(FIXTURE.slug);
    expect(found?.orgUrl).toBeUndefined();
    expect(found?.tags).toBeUndefined();
  });
});
