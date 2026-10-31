import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OPPORTUNITY_KINDS } from "@/opportunities/kinds";
import type { Opportunity } from "@/opportunities/types";
import { navigation } from "../../../test/next-navigation";
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

const items = [
  make({ title: "London Job", type: "job", locationCountry: "GB", remote: false }),
  make({ title: "Remote Fellowship", type: "fellowship", locationCountry: "GB", remote: true }),
  make({ title: "Paris Course", type: "course", locationCountry: "FR", remote: false, deadline: "2026-11-10" }),
  make({ title: "Global Event", type: "event", locationCountry: "GLOBAL", remote: true }),
];

const shownTitles = () => screen.queryAllByRole("listitem").map((item) => item.querySelector("p")?.textContent);

describe("OpportunitiesBoard", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
  });

  it("shows every opportunity, with a count, and no clear link, by default", () => {
    render(<OpportunitiesBoard opportunities={items} />);
    expect(shownTitles()).toEqual(["London Job", "Remote Fellowship", "Paris Course", "Global Event"]);
    expect(screen.getByText("4 opportunities")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("has a chip for every kind of listing, none pressed", () => {
    render(<OpportunitiesBoard opportunities={items} />);
    const chips = within(screen.getByRole("group", { name: "Type" })).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual(["Jobs", "Fellowships", "Projects", "Courses", "Events"]);
    expect(chips.every((chip) => chip.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("narrows to the chosen types, styled as their badges, and records them in the URL", async () => {
    render(<OpportunitiesBoard opportunities={items} />);
    await userEvent.click(screen.getByRole("button", { name: "Jobs" }));
    await userEvent.click(screen.getByRole("button", { name: "Events" }));

    expect(shownTitles()).toEqual(["London Job", "Global Event"]);
    expect(screen.getByRole("button", { name: "Jobs" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Jobs" })).toHaveClass(...OPPORTUNITY_KINDS.job.badge.split(" "));
    expect(window.location.search).toBe("?type=job,event");
    expect(navigation.replace).toHaveBeenLastCalledWith("/?type=job,event", { scroll: false });
  });

  it("shows everything again once the last chip is unpressed, with a clean URL", async () => {
    render(<OpportunitiesBoard opportunities={items} />);
    await userEvent.click(screen.getByRole("button", { name: "Jobs" }));
    await userEvent.click(screen.getByRole("button", { name: "Jobs" }));
    expect(shownTitles()).toHaveLength(4);
    expect(window.location.search).toBe("");
    expect(navigation.replace).toHaveBeenLastCalledWith("/", { scroll: false });
  });

  it("offers only the countries listings are in, with counts", () => {
    render(<OpportunitiesBoard opportunities={items} />);
    const options = within(screen.getByRole("combobox", { name: "Country" })).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Any country", "France (1)", "United Kingdom (2)"]);
  });

  it("narrows to a country plus the global listings", async () => {
    render(<OpportunitiesBoard opportunities={items} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Country" }), "GB");
    expect(shownTitles()).toEqual(["London Job", "Remote Fellowship", "Global Event"]);
    expect(window.location.search).toBe("?country=GB");

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Country" }), "");
    expect(shownTitles()).toHaveLength(4);
    expect(window.location.search).toBe("");
  });

  it("leaves out global and remote listings when unticked", async () => {
    render(<OpportunitiesBoard opportunities={items} />);
    const checkbox = screen.getByRole("checkbox", { name: "Include global and remote" });
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(shownTitles()).toEqual(["London Job", "Paris Course"]);
    expect(window.location.search).toBe("?local=1");
  });

  it("narrows to listings closing soon", async () => {
    render(<OpportunitiesBoard opportunities={items} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Closing soon" }));
    expect(shownTitles()).toEqual(["Paris Course"]);
    expect(screen.getByText("1 opportunity")).toBeInTheDocument();
    expect(window.location.search).toBe("?soon=1");
  });

  it("reads its filters from the URL, ignoring values it doesn't know", () => {
    window.history.replaceState(null, "", "/opportunities?type=job,bogus&country=GB&local=1&colour=red");
    render(<OpportunitiesBoard opportunities={items} />);
    expect(shownTitles()).toEqual(["London Job"]);
    expect(screen.getByRole("button", { name: "Jobs" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("combobox", { name: "Country" })).toHaveValue("GB");
    expect(screen.getByRole("checkbox", { name: "Include global and remote" })).not.toBeChecked();
  });

  it("keeps a country from the URL selected even when nothing is based there", () => {
    window.history.replaceState(null, "", "/opportunities?country=DE");
    render(<OpportunitiesBoard opportunities={items} />);
    expect(screen.getByRole("combobox", { name: "Country" })).toHaveValue("DE");
    expect(shownTitles()).toEqual(["Global Event"]);
  });

  it("clears every filter from the link beside the count", async () => {
    window.history.replaceState(null, "", "/opportunities?type=job&soon=1&local=1");
    render(<OpportunitiesBoard opportunities={[...items, make({ title: "Soon Job", locationCountry: "GB", remote: false, deadline: "2026-11-05" })]} />);
    expect(shownTitles()).toEqual(["Soon Job"]);
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(shownTitles()).toHaveLength(5);
    expect(window.location.pathname + window.location.search).toBe("/opportunities");
  });

  it("says when nothing matches, and offers to clear the filters", async () => {
    window.history.replaceState(null, "", "/opportunities?type=project");
    render(<OpportunitiesBoard opportunities={items} />);
    expect(screen.getByText("No opportunities match these filters.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(shownTitles()).toHaveLength(4);
  });

  it("says when there are no listings at all", () => {
    render(<OpportunitiesBoard opportunities={[]} />);
    expect(screen.getByText("No live opportunities right now.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });
});
