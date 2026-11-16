import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { navigation } from "../../../test/next-navigation";
import AdminSidebar from "./AdminSidebar";
import AdminTabs from "./AdminTabs";
import type { ShellGroup, ShellLink } from "./nav";

const GROUPS: ShellGroup[] = [
  {
    name: "Review",
    links: [
      { href: "/admin/applications", label: "Collaboration", count: { value: 2, label: "waiting", urgent: false } },
      { href: "/admin/red-lines-dialogue", label: "Red Lines" },
    ],
  },
  { name: "Work", links: [{ href: "/admin/task-tracker", label: "Projects", count: { value: 1, label: "of your tasks overdue", urgent: true } }] },
];
const ACCOUNT: ShellLink[] = [{ href: "/admin/settings", label: "Settings" }];

function renderAt(path: string) {
  window.history.replaceState(null, "", path);
  return render(<AdminSidebar groups={GROUPS} account={ACCOUNT} name="Jane Admin" />);
}

const menuButton = () => screen.getByRole("button", { name: "Menu" });

describe("AdminSidebar", () => {
  it("marks the link for the current page", () => {
    renderAt("/admin/applications/abc");
    expect(screen.getByRole("link", { name: "Collaboration (2 waiting)" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Red Lines" })).not.toHaveAttribute("aria-current");
  });

  it("marks the dashboard only on the dashboard itself", () => {
    const { unmount } = renderAt("/admin");
    const admin = () => within(screen.getByRole("complementary")).getByRole("link", { name: "Admin" });
    expect(admin()).toHaveAttribute("aria-current", "page");
    unmount();
    renderAt("/admin/erasure");
    expect(admin()).not.toHaveAttribute("aria-current");
  });

  it("asks for fresh counts on each new page, but not on the first", () => {
    renderAt("/admin/applications/abc");
    expect(navigation.refresh).not.toHaveBeenCalled();
    act(() => window.history.pushState(null, "", "/admin/applications"));
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it("opens the drawer as a modal dialog from the Menu button, focusing its first link", async () => {
    renderAt("/admin");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(menuButton());
    const dialog = screen.getByRole("dialog", { name: "Admin menu" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(menuButton()).toHaveAttribute("aria-expanded", "true");
    expect(menuButton()).toHaveAttribute("aria-controls", dialog.id);
    expect(within(dialog).getAllByRole("link")[0]).toHaveFocus();
  });

  it("keeps focus inside the open drawer", async () => {
    renderAt("/admin");
    await userEvent.click(menuButton());
    const dialog = screen.getByRole("dialog");
    const first = within(dialog).getAllByRole("link")[0];
    const last = within(dialog).getByRole("button", { name: "Account" });
    await userEvent.tab({ shift: true });
    expect(last).toHaveFocus();
    await userEvent.tab();
    expect(first).toHaveFocus();
    await userEvent.tab();
    expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("closes on Escape and gives focus back to the Menu button", async () => {
    renderAt("/admin");
    await userEvent.click(menuButton());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(menuButton()).toHaveFocus();
  });

  it("closes from its Close button", async () => {
    renderAt("/admin");
    await userEvent.click(menuButton());
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes when the backdrop is clicked", async () => {
    const { container } = renderAt("/admin");
    await userEvent.click(menuButton());
    fireEvent.click(container.querySelector('[aria-hidden="true"].fixed')!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes once a link has taken the visitor to another page", async () => {
    renderAt("/admin");
    await userEvent.click(menuButton());
    window.history.pushState(null, "", "/admin/red-lines-dialogue");
    expect(await screen.findByRole("link", { name: "Red Lines" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ignores keys while the drawer is closed", () => {
    renderAt("/admin");
    fireEvent.keyDown(screen.getByRole("complementary"), { key: "Escape" });
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });

  describe("the account menu", () => {
    const account = () => screen.getByRole("button", { name: "Account" });

    it("toggles the account links", async () => {
      renderAt("/admin");
      expect(screen.getByText("Signed in as Jane Admin")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
      expect(account()).not.toHaveAttribute("aria-controls");
      await userEvent.click(account());
      expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/admin/settings");
      expect(screen.getByRole("link", { name: "Settings" }).closest("ul")).toHaveAttribute("id", account().getAttribute("aria-controls"));
      await userEvent.click(account());
      expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
    });

    it("starts open on one of its own pages, with that page marked", () => {
      renderAt("/admin/settings");
      expect(account()).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
    });

    it("closes on Escape without closing the drawer around it", async () => {
      renderAt("/admin");
      await userEvent.click(menuButton());
      await userEvent.click(account());
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
      expect(account()).toHaveFocus();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("closes on a click elsewhere", async () => {
      renderAt("/admin");
      await userEvent.click(account());
      await userEvent.click(screen.getByRole("link", { name: "Red Lines" }));
      expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
    });

    it("stays open for a click inside it", async () => {
      renderAt("/admin");
      await userEvent.click(account());
      fireEvent.pointerDown(screen.getByRole("link", { name: "Settings" }));
      expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
    });
  });
});

describe("AdminTabs", () => {
  it("marks the tab for the current page and counts what waits behind one", () => {
    window.history.replaceState(null, "", "/admin/opportunities/new");
    render(
      <AdminTabs
        label="Opportunities"
        tabs={[
          { href: "/admin/opportunities", label: "Listings" },
          { href: "/admin/opportunities/new", label: "New opportunity" },
          { href: "/admin/opportunities/submissions", label: "Submissions", count: { value: 0, label: "to review" } },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "New opportunity" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Listings" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Submissions" })).toBeInTheDocument();
  });
});
