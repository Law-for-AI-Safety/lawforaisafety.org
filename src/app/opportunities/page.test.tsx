import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withOpportunities } from "../../../test/fakes/opportunities-dir";
import type { Opportunity } from "@/opportunities/types";
import OpportunitiesPage, { metadata } from "./page";

const FIXTURE: Opportunity = {
  slug: "fixture-job",
  type: "job",
  title: "Fixture Job",
  org: "Fixture Org",
  summary: "A short summary.",
  description: "A longer description.",
  location: "Remote",
  remote: true,
  applyUrl: "https://example.com/apply",
  publishedAt: "2026-01-01",
};

let restore: () => void;
beforeEach(() => {
  restore = withOpportunities([FIXTURE]).restore;
});
afterEach(() => restore());

describe("the opportunities index page", () => {
  it("renders a heading and at least one listing", () => {
    render(<OpportunitiesPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Opportunities");
    expect(screen.getByText(FIXTURE.title)).toBeInTheDocument();
  });

  it("has metadata for the canonical URL", () => {
    expect(metadata).toMatchObject({ alternates: { canonical: "/opportunities" } });
  });
});
