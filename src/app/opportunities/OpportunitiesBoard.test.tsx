import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const openLocations = () => userEvent.click(screen.getByRole("button", { name: /^Location/ }));
const locationPanel = () => screen.getByRole("group", { name: "Location" });

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

  it("has an unticked box for every kind of listing", () => {
    render(<OpportunitiesBoard opportunities={items} />);
    const boxes = within(screen.getByRole("group", { name: "Type" })).getAllByRole("checkbox");
    expect(boxes.map((box) => box.closest("label")?.textContent)).toEqual(["Jobs", "Fellowships", "Projects", "Courses", "Events"]);
    expect(boxes.every((box) => !(box as HTMLInputElement).checked)).toBe(true);
  });

  it("narrows to the ticked types and records them in the URL", async () => {
    render(<OpportunitiesBoard opportunities={items} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Jobs" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Events" }));

    expect(shownTitles()).toEqual(["London Job", "Global Event"]);
    expect(screen.getByRole("checkbox", { name: "Jobs" })).toBeChecked();
    expect(window.location.search).toBe("?type=job,event");
    expect(navigation.replace).toHaveBeenLastCalledWith("/?type=job,event", { scroll: false });
  });

  it("shows everything again once the last type is unticked, with a clean URL", async () => {
    render(<OpportunitiesBoard opportunities={items} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Jobs" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Jobs" }));
    expect(shownTitles()).toHaveLength(4);
    expect(window.location.search).toBe("");
    expect(navigation.replace).toHaveBeenLastCalledWith("/", { scroll: false });
  });

  it("keeps the locations closed until asked, then offers global and remote and each country, with counts", async () => {
    render(<OpportunitiesBoard opportunities={items} />);
    const button = screen.getByRole("button", { name: "Location Anywhere" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "Location" })).not.toBeInTheDocument();

    await openLocations();
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(within(locationPanel()).getAllByRole("checkbox").map((box) => box.closest("label")?.textContent)).toEqual([
      "Global and remote (2)",
      "France (1)",
      "United Kingdom (2)",
    ]);
  });

  it("counts locations under the other filters, but not under the location filter itself", async () => {
    render(<OpportunitiesBoard opportunities={items} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Fellowships" }));
    await openLocations();
    expect(within(locationPanel()).getAllByRole("checkbox").map((box) => box.closest("label")?.textContent)).toEqual([
      "Global and remote (1)",
      "United Kingdom (1)",
    ]);

    await userEvent.click(within(locationPanel()).getByRole("checkbox", { name: "Global and remote (1)" }));
    expect(within(locationPanel()).getByRole("checkbox", { name: "United Kingdom (1)" })).not.toBeChecked();
  });

  it("keeps a ticked country listed when the other filters leave nothing there", async () => {
    window.history.replaceState(null, "", "/opportunities?location=FR&type=job");
    render(<OpportunitiesBoard opportunities={items} />);
    await openLocations();
    expect(within(locationPanel()).getByRole("checkbox", { name: "France (0)" })).toBeChecked();
  });

  it("narrows to a ticked country, then adds global and remote listings", async () => {
    render(<OpportunitiesBoard opportunities={items} />);
    await openLocations();
    await userEvent.click(within(locationPanel()).getByRole("checkbox", { name: "France (1)" }));
    expect(shownTitles()).toEqual(["Paris Course"]);
    expect(window.location.search).toBe("?location=FR");
    expect(screen.getByRole("button", { name: /^Location/ })).toHaveTextContent("France");

    await userEvent.click(within(locationPanel()).getByRole("checkbox", { name: "Global and remote (2)" }));
    expect(shownTitles()).toEqual(["Remote Fellowship", "Paris Course", "Global Event"]);
    expect(window.location.search).toBe("?location=FR,global");
    expect(screen.getByRole("button", { name: /^Location/ })).toHaveTextContent("2 locations");

    await userEvent.click(within(locationPanel()).getByRole("checkbox", { name: "France (1)" }));
    expect(screen.getByRole("button", { name: /^Location/ })).toHaveTextContent("Global and remote");
  });

  it("includes remote listings based in a ticked country", async () => {
    render(<OpportunitiesBoard opportunities={items} />);
    await openLocations();
    await userEvent.click(within(locationPanel()).getByRole("checkbox", { name: "United Kingdom (2)" }));
    expect(shownTitles()).toEqual(["London Job", "Remote Fellowship"]);
  });

  it("clears the locations from inside the panel", async () => {
    window.history.replaceState(null, "", "/opportunities?location=GB,global");
    render(<OpportunitiesBoard opportunities={items} />);
    await openLocations();
    await userEvent.click(within(locationPanel()).getByRole("button", { name: "Any location" }));
    expect(shownTitles()).toHaveLength(4);
    expect(window.location.search).toBe("");
  });

  it("closes the panel from Done, Escape or a click outside, handing focus back to the button", async () => {
    render(<OpportunitiesBoard opportunities={items} />);
    const button = screen.getByRole("button", { name: /^Location/ });

    await openLocations();
    await userEvent.click(within(locationPanel()).getByRole("button", { name: "Done" }));
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();

    await openLocations();
    await userEvent.click(within(locationPanel()).getByRole("checkbox", { name: "France (1)" }));
    await userEvent.keyboard("{Escape}");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();

    await openLocations();
    await userEvent.click(within(locationPanel()).getByRole("checkbox", { name: "France (1)" }));
    expect(button).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(screen.getByText("4 opportunities"));
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("leaves other Escape presses alone while the panel is shut", async () => {
    render(<OpportunitiesBoard opportunities={items} />);
    screen.getByRole("button", { name: /^Location/ }).focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: /^Location/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("narrows to listings closing soon", async () => {
    render(<OpportunitiesBoard opportunities={items} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Closing soon" }));
    expect(shownTitles()).toEqual(["Paris Course"]);
    expect(screen.getByText("1 opportunity")).toBeInTheDocument();
    expect(window.location.search).toBe("?soon=1");
  });

  it("reads its filters from the URL, ignoring values it doesn't know", async () => {
    window.history.replaceState(null, "", "/opportunities?type=job,bogus&location=GB,XX&colour=red");
    render(<OpportunitiesBoard opportunities={items} />);
    expect(shownTitles()).toEqual(["London Job"]);
    expect(screen.getByRole("checkbox", { name: "Jobs" })).toBeChecked();
    expect(screen.getByRole("button", { name: /^Location/ })).toHaveTextContent("United Kingdom");
    await openLocations();
    expect(within(locationPanel()).getByRole("checkbox", { name: "United Kingdom (1)" })).toBeChecked();
  });

  it("keeps a country from the URL ticked even when nothing is based there", async () => {
    window.history.replaceState(null, "", "/opportunities?location=DE");
    render(<OpportunitiesBoard opportunities={items} />);
    expect(screen.getByText("No opportunities match these filters.")).toBeInTheDocument();
    await openLocations();
    expect(within(locationPanel()).getByRole("checkbox", { name: "Germany (0)" })).toBeChecked();
  });

  it("clears every filter from the link beside the count", async () => {
    window.history.replaceState(null, "", "/opportunities?type=job&soon=1&location=GB");
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
