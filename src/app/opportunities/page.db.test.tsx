import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { opportunities } from "@/drizzle/schema";
import { db } from "@/lib/db";
import OpportunitiesPage, { metadata } from "./page";

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
  await db.insert(opportunities).values(FIXTURE);
});

describe("the opportunities index page", () => {
  it("renders a heading and at least one listing", async () => {
    render(await OpportunitiesPage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Opportunities");
    expect(screen.getByText(FIXTURE.title)).toBeInTheDocument();
  });

  it("has metadata for the canonical URL", () => {
    expect(metadata).toMatchObject({ alternates: { canonical: "/opportunities" } });
  });
});
