import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import Nav from "./Nav";

/** The desktop links: the first of the two navs (the second is the mobile menu). */
const desktop = () => screen.getAllByRole("navigation")[0];
const topLevel = () =>
  within(desktop())
    .getAllByRole("link")
    .filter((link) => link.parentElement?.parentElement === desktop().querySelector("div.hidden"))
    .map((link) => link.textContent);

describe("Nav", () => {
  it("leads with About, Our Work, Opportunities and Contact", () => {
    render(<Nav />);
    expect(topLevel()).toEqual(["About", "Our Work", "Opportunities", "Contact"]);
  });

  it("gathers Mission, Our Story, Team and Advisors under About, pointing at the homepage's sections", () => {
    window.history.replaceState(null, "", "/opportunities");
    render(<Nav />);
    const about = within(desktop()).getByRole("link", { name: "About" }).parentElement!;
    expect(
      within(about)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["About", "/#mission"],
      ["Mission", "/#mission"],
      ["Our Story", "/#our-story"],
      ["Team", "/#team"],
      ["Advisors", "/#advisors"],
    ]);
  });

  it("links to the homepage's sections in place on the homepage", () => {
    render(<Nav />);
    expect(within(desktop()).getByRole("link", { name: "Team" })).toHaveAttribute("href", "#team");
  });

  it("marks Opportunities as current on the board and the pages under it", () => {
    window.history.replaceState(null, "", "/opportunities/submit");
    render(<Nav />);
    expect(within(desktop()).getByRole("link", { name: "Opportunities" }).firstElementChild).toHaveClass("text-brand-red");
    expect(within(desktop()).getByRole("link", { name: "Contact" }).firstElementChild).not.toHaveClass("text-brand-red");
  });

  it("keeps the dropdown links reachable from the keyboard", async () => {
    render(<Nav />);
    within(desktop()).getByRole("link", { name: "About" }).focus();
    await userEvent.tab();
    expect(within(desktop()).getByRole("link", { name: "Mission" })).toHaveFocus();
    expect(within(desktop()).getByRole("link", { name: "Mission" }).closest("div.invisible")).toHaveClass(
      "group-focus-within:visible",
    );
  });

  it("lists the same links in the mobile menu", () => {
    render(<Nav />);
    const mobile = screen.getAllByRole("navigation")[1];
    expect(within(mobile).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "About",
      "Mission",
      "Our Story",
      "Team",
      "Advisors",
      "Our Work",
      "Red Lines Dialogues",
      "MEP Outreach",
      "Council of Europe Engagement",
      "Field-building & Coordination",
      "Freedom of Information",
      "Opportunities",
      "Contact",
    ]);
  });
});
