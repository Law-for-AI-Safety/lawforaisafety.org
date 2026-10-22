import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withOpportunities } from "../../../../test/fakes/opportunities-dir";
import type { Opportunity } from "@/opportunities/types";
import OpportunitiesListPage from "./page";

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

describe("OpportunitiesListPage", () => {
  it("lists every opportunity, linking to its edit page", () => {
    render(<OpportunitiesListPage />);
    const link = screen.getByRole("link", { name: FIXTURE.title });
    expect(link).toHaveAttribute("href", `/admin/opportunities/${FIXTURE.slug}`);
  });

  it("has a link to add a new opportunity", () => {
    render(<OpportunitiesListPage />);
    expect(screen.getByRole("link", { name: "New opportunity" })).toHaveAttribute("href", "/admin/opportunities/new");
  });

  it("shows an empty-state message when there are no opportunities", () => {
    restore();
    restore = withOpportunities([]).restore;
    render(<OpportunitiesListPage />);
    expect(screen.getByText("There are no opportunities yet.")).toBeInTheDocument();
  });
});
