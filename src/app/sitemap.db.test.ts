import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { opportunities } from "@/drizzle/schema";
import { db } from "@/lib/db";
import sitemap from "./sitemap";

const FIXTURE = {
  slug: "fixture-job",
  type: "job" as const,
  title: "Fixture Job",
  org: "Fixture Org",
  summary: "A short summary.",
  description: "A longer description.",
  location: "Remote",
  remote: true,
  applyUrl: "https://example.com/apply",
  publishedAt: "2026-01-01",
  createdBy: "admin@example.com",
};

beforeEach(async () => {
  await db.delete(opportunities);
  await db.insert(opportunities).values(FIXTURE);
});

describe("sitemap.xml", () => {
  it("lists the homepage first, then every public page", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls[0]).toBe("https://lawforaisafety.org");
    for (const page of ["field-building", "red-lines-dialogue", "mep-outreach", "council-of-europe", "freedom-of-information"]) {
      expect(urls, page).toContain(`https://lawforaisafety.org/${page}`);
    }
  });

  it("dates content pages by their files' updatedAt", async () => {
    const entries = await sitemap();
    const { updatedAt } = JSON.parse(fs.readFileSync("content/field-building.json", "utf8"));
    expect(entries.find((e) => e.url.endsWith("/field-building"))?.lastModified).toEqual(new Date(updatedAt));
  });

  it("leaves out the admin, the flows' steps and anything not a page", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    for (const url of urls) expect(url).not.toMatch(/\/(admin|api|apply|newsletter|og-assets)\b|\/(confirm|retry)$|\[/);
  });

  it("lists the opportunities board and every opportunity's own page", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain("https://lawforaisafety.org/opportunities");
    expect(urls).toContain(`https://lawforaisafety.org/opportunities/${FIXTURE.slug}`);
  });
});
