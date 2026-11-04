import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
    status: "published",
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

const NOW = new Date("2026-10-31T12:00:00Z");

const shownTitles = () => screen.queryAllByRole("listitem").map((item) => item.querySelector("p")?.textContent);

const openLocations = () => userEvent.click(screen.getByRole("button", { name: /^Location/ }));
const locationPanel = () => screen.getByRole("group", { name: "Location" });

describe("OpportunitiesBoard", () => {
  it("shows every opportunity, closing soonest first, with a count, and no clear link, by default", () => {
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
    expect(shownTitles()).toEqual(["Paris Course", "London Job", "Remote Fellowship", "Global Event"]);
    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue("closing");
    expect(screen.getByText("4 opportunities")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("has an unticked box for every kind of listing", () => {
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
    const boxes = within(screen.getByRole("group", { name: "Type" })).getAllByRole("checkbox");
    expect(boxes.map((box) => box.closest("label")?.textContent)).toEqual(["Jobs", "Fellowships", "Projects", "Courses", "Events"]);
    expect(boxes.every((box) => !(box as HTMLInputElement).checked)).toBe(true);
  });

  it("narrows to the ticked types and records them in the URL", async () => {
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Jobs" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Events" }));

    expect(shownTitles()).toEqual(["London Job", "Global Event"]);
    expect(screen.getByRole("checkbox", { name: "Jobs" })).toBeChecked();
    expect(window.location.search).toBe("?type=job,event");
  });

  it("filters in the page, without a router navigation that would ask the server to render again", async () => {
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Jobs" }));
    await openLocations();
    await userEvent.click(within(locationPanel()).getByRole("checkbox", { name: "United Kingdom (1)" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Closing soon" }));
    expect(window.location.search).toBe("?type=job&location=GB&soon=1");
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("builds each change on the address as it stands, not on the last render", async () => {
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
    // As if an earlier tick had reached the address bar but not yet re-rendered the board: the
    // prototype's method skips the stand-in router's notice to re-render.
    History.prototype.replaceState.call(window.history, null, "", "/?type=event");
    expect(screen.getByRole("checkbox", { name: "Events" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "Jobs" }));
    expect(window.location.search).toBe("?type=job,event");
  });

  it("judges closing soon by the clock it is given, not the browser's", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-03-01T12:00:00Z"));
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Closing soon" }));
    expect(shownTitles()).toEqual(["Paris Course"]);
    expect(screen.getByText(/Closing soon · Enrol by/)).toBeInTheDocument();
  });

  it("shows everything again once the last type is unticked, with a clean URL", async () => {
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Jobs" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Jobs" }));
    expect(shownTitles()).toHaveLength(4);
    expect(window.location.pathname + window.location.search).toBe("/");
  });

  it("keeps the locations closed until asked, then offers global and remote and each country, with counts", async () => {
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
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
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
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
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
    await openLocations();
    expect(within(locationPanel()).getByRole("checkbox", { name: "France (0)" })).toBeChecked();
  });

  it("narrows to a ticked country, then adds global and remote listings", async () => {
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
    await openLocations();
    await userEvent.click(within(locationPanel()).getByRole("checkbox", { name: "France (1)" }));
    expect(shownTitles()).toEqual(["Paris Course"]);
    expect(window.location.search).toBe("?location=FR");
    expect(screen.getByRole("button", { name: /^Location/ })).toHaveTextContent("France");

    await userEvent.click(within(locationPanel()).getByRole("checkbox", { name: "Global and remote (2)" }));
    expect(shownTitles()).toEqual(["Paris Course", "Remote Fellowship", "Global Event"]);
    expect(window.location.search).toBe("?location=FR,global");
    expect(screen.getByRole("button", { name: /^Location/ })).toHaveTextContent("2 locations");

    await userEvent.click(within(locationPanel()).getByRole("checkbox", { name: "France (1)" }));
    expect(screen.getByRole("button", { name: /^Location/ })).toHaveTextContent("Global and remote");
  });

  it("includes remote listings based in a ticked country", async () => {
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
    await openLocations();
    await userEvent.click(within(locationPanel()).getByRole("checkbox", { name: "United Kingdom (2)" }));
    expect(shownTitles()).toEqual(["London Job", "Remote Fellowship"]);
  });

  it("clears the locations from inside the panel", async () => {
    window.history.replaceState(null, "", "/opportunities?location=GB,global");
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
    await openLocations();
    await userEvent.click(within(locationPanel()).getByRole("button", { name: "Any location" }));
    expect(shownTitles()).toHaveLength(4);
    expect(window.location.search).toBe("");
  });

  it("closes the panel from Done, Escape or a click outside, handing focus back to the button", async () => {
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
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

  it("closes the panel when keyboard focus moves outside it, but not on a click inside it", async () => {
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
    const button = screen.getByRole("button", { name: /^Location/ });
    await openLocations();
    await userEvent.click(locationPanel());
    expect(button).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(within(locationPanel()).getByRole("checkbox", { name: "France (1)" }));
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(button).toHaveAttribute("aria-expanded", "true");
    await userEvent.tab();
    expect(screen.getByRole("checkbox", { name: "Closing soon" })).toHaveFocus();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("leaves other Escape presses alone while the panel is shut", async () => {
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
    screen.getByRole("button", { name: /^Location/ }).focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: /^Location/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("narrows to listings closing soon", async () => {
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Closing soon" }));
    expect(shownTitles()).toEqual(["Paris Course"]);
    expect(screen.getByText("1 opportunity")).toBeInTheDocument();
    expect(window.location.search).toBe("?soon=1");
  });

  it("reads its filters from the URL, ignoring values it doesn't know", async () => {
    window.history.replaceState(null, "", "/opportunities?type=job,bogus&location=GB,XX&colour=red");
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
    expect(shownTitles()).toEqual(["London Job"]);
    expect(screen.getByRole("checkbox", { name: "Jobs" })).toBeChecked();
    expect(screen.getByRole("button", { name: /^Location/ })).toHaveTextContent("United Kingdom");
    await openLocations();
    expect(within(locationPanel()).getByRole("checkbox", { name: "United Kingdom (1)" })).toBeChecked();
  });

  it("keeps a country from the URL ticked even when nothing is based there", async () => {
    window.history.replaceState(null, "", "/opportunities?location=DE");
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
    expect(screen.getByText("No opportunities match these filters.")).toBeInTheDocument();
    await openLocations();
    expect(within(locationPanel()).getByRole("checkbox", { name: "Germany (0)" })).toBeChecked();
  });

  it("clears every filter from the link beside the count", async () => {
    window.history.replaceState(null, "", "/opportunities?type=job&soon=1&location=GB");
    render(<OpportunitiesBoard opportunities={[...items, make({ title: "Soon Job", locationCountry: "GB", remote: false, deadline: "2026-11-05" })]} now={NOW} />);
    expect(shownTitles()).toEqual(["Soon Job"]);
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(shownTitles()).toHaveLength(5);
    expect(window.location.pathname + window.location.search).toBe("/opportunities");
  });

  it("sorts by newest, records it in the URL, and keeps the order when the filters are cleared", async () => {
    const dated = [
      make({ title: "Old Soon", publishedAt: "2026-01-01", deadline: "2026-11-02", locationCountry: "GB", remote: false }),
      make({ title: "New Undated", publishedAt: "2026-10-01" }),
      make({ title: "Mid Later", publishedAt: "2026-06-01", deadline: "2026-12-20" }),
    ];
    render(<OpportunitiesBoard opportunities={dated} now={NOW} />);
    expect(shownTitles()).toEqual(["Old Soon", "Mid Later", "New Undated"]);

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "Newest");
    expect(shownTitles()).toEqual(["New Undated", "Mid Later", "Old Soon"]);
    expect(window.location.search).toBe("?sort=newest");
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "Closing soon" }));
    expect(window.location.search).toBe("?soon=1&sort=newest");
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(window.location.search).toBe("?sort=newest");
    expect(shownTitles()).toEqual(["New Undated", "Mid Later", "Old Soon"]);

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "Closing soonest");
    expect(window.location.search).toBe("");
    expect(shownTitles()).toEqual(["Old Soon", "Mid Later", "New Undated"]);
  });

  it("opens in the order the URL asks for", () => {
    window.history.replaceState(null, "", "/opportunities?sort=newest");
    render(
      <OpportunitiesBoard
        opportunities={[make({ title: "Older", deadline: "2026-11-05" }), make({ title: "Newer", publishedAt: "2026-09-01" })]}
        now={NOW}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue("newest");
    expect(shownTitles()).toEqual(["Newer", "Older"]);
  });

  it("says when nothing matches, and offers to clear the filters", async () => {
    window.history.replaceState(null, "", "/opportunities?type=project");
    render(<OpportunitiesBoard opportunities={items} now={NOW} />);
    expect(screen.getByText("No opportunities match these filters.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(shownTitles()).toHaveLength(4);
  });

  it("says when there are no listings at all", () => {
    render(<OpportunitiesBoard opportunities={[]} now={NOW} />);
    expect(screen.getByText("No live opportunities right now.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });
});
