import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Opportunity } from "@/opportunities/types";
import EditOpportunityForm from "./EditOpportunityForm";

const opportunity: Opportunity = {
  id: "00000000-0000-0000-0000-000000000000",
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

describe("EditOpportunityForm", () => {
  it("prefills the form from the given opportunity", () => {
    render(<EditOpportunityForm opportunity={opportunity} />);
    expect(screen.getByLabelText("Title")).toHaveValue(opportunity.title);
    expect(screen.getByLabelText("Organisation")).toHaveValue(opportunity.org);
    expect(screen.getByLabelText("Apply URL")).toHaveValue(opportunity.applyUrl);
    expect(screen.getByRole("button", { name: "Remove this listing" })).toBeInTheDocument();
  });
});
