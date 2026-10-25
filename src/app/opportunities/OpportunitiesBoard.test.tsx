import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Opportunity } from "@/opportunities/types";
import OpportunitiesBoard from "./OpportunitiesBoard";

function make(overrides: Partial<Opportunity>): Opportunity {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    slug: overrides.title?.toLowerCase().replace(/\s+/g, "-") ?? "test",
    type: "job",
    title: "Test",
    org: "Test org",
    summary: "Summary.",
    description: "Body.",
    locationCountry: "GLOBAL",
    remote: true,
    applyUrl: "https://example.com",
    publishedAt: "2026-01-01",
    ...overrides,
  };
}

const items = [make({ title: "A Job", type: "job" }), make({ title: "A Course", type: "course" })];

describe("OpportunitiesBoard", () => {
  it("shows every opportunity under the All tab", () => {
    render(<OpportunitiesBoard opportunities={items} />);
    expect(screen.getByText("A Job")).toBeInTheDocument();
    expect(screen.getByText("A Course")).toBeInTheDocument();
  });

  it("narrows to jobs only when the Jobs tab is selected", async () => {
    render(<OpportunitiesBoard opportunities={items} />);
    await userEvent.click(screen.getByRole("tab", { name: "Jobs" }));
    expect(screen.getByText("A Job")).toBeInTheDocument();
    expect(screen.queryByText("A Course")).not.toBeInTheDocument();
  });

  it("narrows to courses only when the Courses tab is selected", async () => {
    render(<OpportunitiesBoard opportunities={items} />);
    await userEvent.click(screen.getByRole("tab", { name: "Courses" }));
    expect(screen.queryByText("A Job")).not.toBeInTheDocument();
    expect(screen.getByText("A Course")).toBeInTheDocument();
  });

  it("has a tab for every kind of listing", () => {
    render(<OpportunitiesBoard opportunities={items} />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "All",
      "Jobs",
      "Fellowships",
      "Projects",
      "Courses",
      "Events",
    ]);
  });

  it("narrows to events only when the Events tab is selected", async () => {
    render(<OpportunitiesBoard opportunities={[...items, make({ title: "An Event", type: "event" })]} />);
    await userEvent.click(screen.getByRole("tab", { name: "Events" }));
    expect(screen.getByText("An Event")).toBeInTheDocument();
    expect(screen.queryByText("A Job")).not.toBeInTheDocument();
  });

  it("shows an empty-state message when a category has nothing in it", async () => {
    render(<OpportunitiesBoard opportunities={[make({ title: "Only Job", type: "job" })]} />);
    await userEvent.click(screen.getByRole("tab", { name: "Courses" }));
    expect(screen.getByText(/No live opportunities/)).toBeInTheDocument();
  });
});
