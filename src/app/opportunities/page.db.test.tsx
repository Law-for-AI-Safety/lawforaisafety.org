import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { opportunities } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { createOpportunity } from "@/lib/opportunities-flow";
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

  it("leaves out a listing whose deadline has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
    await db.insert(opportunities).values([
      { ...FIXTURE, slug: "closed-job", title: "Closed Job", deadline: "2026-10-30" },
      { ...FIXTURE, slug: "open-job", title: "Open Job", deadline: "2026-10-31" },
    ]);
    render(await OpportunitiesPage());
    expect(screen.queryByText("Closed Job")).not.toBeInTheDocument();
    expect(screen.getByText("Open Job")).toBeInTheDocument();
  });

  it("serves the listings from the cache until an hour has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    render(await OpportunitiesPage());
    await db.insert(opportunities).values({ ...FIXTURE, slug: "inserted-job", title: "Inserted Job" });

    cleanup();
    render(await OpportunitiesPage());
    expect(screen.queryByText("Inserted Job")).not.toBeInTheDocument();

    vi.setSystemTime(new Date("2026-10-01T13:00:01Z"));
    cleanup();
    render(await OpportunitiesPage());
    expect(screen.getByText("Inserted Job")).toBeInTheDocument();
  });

  it("shows a listing created through the flow at once", async () => {
    render(await OpportunitiesPage());
    const { type, org, summary, description, locationCountry, remote, applyUrl } = FIXTURE;
    await createOpportunity(
      { type, title: "Created Job", org, summary, description, locationCountry, remote, applyUrl },
      "admin@example.com",
    );

    cleanup();
    render(await OpportunitiesPage());
    expect(screen.getByText("Created Job")).toBeInTheDocument();
  });

  it("has metadata for the canonical URL", () => {
    expect(metadata).toMatchObject({ alternates: { canonical: "/opportunities" } });
  });
});
