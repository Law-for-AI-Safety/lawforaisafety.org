import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminLoginPage from "./page";

async function renderWith(error?: string) {
  return render(await AdminLoginPage({ searchParams: Promise.resolve(error === undefined ? {} : { error }) }));
}

describe("the admin login page", () => {
  it.each([
    ["invalid", "That login link isn't valid. Please try again."],
    ["denied", "LinkedIn login was cancelled."],
    ["forbidden", "That LinkedIn account isn't authorised to access the admin area."],
  ])("explains the error %s", async (code, message) => {
    await renderWith(code);
    expect(screen.getByText(message)).toBeVisible();
  });

  it.each([undefined, "", "unknown", "toString", "__proto__", "constructor", "hasOwnProperty"])(
    "shows no error for %j",
    async (code) => {
      const { container } = await renderWith(code);
      expect(container.querySelector("p")).toBeNull();
      expect(screen.getByRole("link", { name: "Log in with LinkedIn" })).toHaveAttribute("href", "/api/admin/auth/linkedin");
    },
  );

  it("shows no dev login shortcut outside development (the default under Vitest)", async () => {
    await renderWith();
    expect(screen.queryByRole("link", { name: "Dev login (skip LinkedIn)" })).toBeNull();
  });

  it("shows the dev login shortcut in development", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await renderWith();

    expect(screen.getByRole("link", { name: "Dev login (skip LinkedIn)" })).toHaveAttribute(
      "href",
      "/api/admin/auth/dev-login",
    );
  });
});
