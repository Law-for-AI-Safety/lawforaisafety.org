import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { opportunities } from "@/drizzle/schema";
import { db } from "@/lib/db";
import OpportunitiesListPage from "./page";

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

describe("OpportunitiesListPage", () => {
  it("lists every opportunity, linking to its edit page", async () => {
    await db.insert(opportunities).values(FIXTURE);
    render(await OpportunitiesListPage());
    const link = screen.getByRole("link", { name: FIXTURE.title });
    expect(link).toHaveAttribute("href", `/admin/opportunities/${FIXTURE.slug}`);
  });

  it("has a link to add a new opportunity", async () => {
    render(await OpportunitiesListPage());
    expect(screen.getByRole("link", { name: "New opportunity" })).toHaveAttribute("href", "/admin/opportunities/new");
  });

  it("shows an empty-state message when there are no opportunities", async () => {
    render(await OpportunitiesListPage());
    expect(screen.getByText("There are no opportunities yet.")).toBeInTheDocument();
  });
});
