import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminLoginPage from "./page";

async function renderWith(error?: string) {
  return render(await AdminLoginPage({ searchParams: Promise.resolve(error === undefined ? {} : { error }) }));
}

beforeEach(() => {
  vi.stubEnv("ADMIN_GOOGLE_DOMAIN", "lais.example");
});

describe("the admin login page", () => {
  it("offers only LinkedIn while Google login isn't set up", async () => {
    vi.stubEnv("ADMIN_GOOGLE_DOMAIN", "");
    await renderWith("unavailable");
    expect(screen.queryByRole("link", { name: "Log in with Google" })).toBeNull();
    expect(screen.queryByText(/Google account\.$/)).toBeNull();
    expect(screen.queryByText(/Still using LinkedIn/)).toBeNull();
    expect(screen.getByRole("link", { name: "Log in with LinkedIn" })).toHaveAttribute("href", "/api/admin/auth/linkedin");
    expect(screen.getByRole("alert")).toHaveTextContent("Google login isn't set up yet. Log in with LinkedIn for now.");
  });

  it("signs in with the organisation's Google accounts", async () => {
    await renderWith();
    expect(screen.getByText("Sign in with your Law for AI Safety Google account.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Log in with Google" })).toHaveAttribute("href", "/api/admin/auth/google");
  });

  it("still offers LinkedIn, saying it closes once the admin switches", async () => {
    await renderWith();
    expect(screen.getByText(/Still using LinkedIn\? .* After that, LinkedIn login stops working for you\./)).toBeVisible();
    expect(screen.getByRole("link", { name: "Log in with LinkedIn" })).toHaveAttribute("href", "/api/admin/auth/linkedin");
  });

  it.each([
    ["invalid", "That login link isn't valid. Please try again."],
    ["denied", "Login was cancelled."],
    [
      "workspace",
      "Use your Law for AI Safety Google account. Personal Google accounts and other organisations' accounts can't access the admin area.",
    ],
    ["forbidden", "That account isn't authorised to access the admin area."],
    [
      "use_google",
      "That LinkedIn account uses your Law for AI Safety address, so log in with your Law for AI Safety Google account instead.",
    ],
    [
      "moved",
      "You've moved to your Law for AI Safety Google account, so LinkedIn login is closed for you. Log in with Google instead.",
    ],
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
