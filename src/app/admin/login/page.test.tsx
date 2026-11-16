import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminLoginPage from "./page";

async function renderWith(error?: string) {
  return render(await AdminLoginPage({ searchParams: Promise.resolve(error === undefined ? {} : { error }) }));
}

describe("the admin login page", () => {
  it("signs in with the organisation's Google accounts", async () => {
    await renderWith();
    expect(screen.getByText("Sign in with your Law for AI Safety Google account.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Log in with Google" })).toHaveAttribute("href", "/api/admin/auth/google");
  });

  it.each([
    ["invalid", "That login link isn't valid. Please try again."],
    ["denied", "Google login was cancelled."],
    [
      "workspace",
      "Use your Law for AI Safety Google account. Personal Google accounts and other organisations' accounts can't access the admin area.",
    ],
    ["forbidden", "That Google account isn't authorised to access the admin area."],
  ])("explains the error %s", async (code, message) => {
    await renderWith(code);
    expect(screen.getByRole("alert")).toHaveTextContent(message);
  });

  it.each([undefined, "", "unknown", "toString", "__proto__", "constructor", "hasOwnProperty"])(
    "shows no error for %j",
    async (code) => {
      await renderWith(code);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("link", { name: "Log in with Google" })).toHaveAttribute("href", "/api/admin/auth/google");
    },
  );
});
