import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookieJar } from "../../../../../../test/next-headers";
import { GET } from "./route";

// `cookies()` needs Next's request context; the browser's cookies are `cookieJar`.
vi.mock("next/headers", () => import("../../../../../../test/next-headers"));

beforeEach(() => {
  cookieJar.reset();
});

describe("GET /api/admin/auth/dev-login", () => {
  it("answers not found outside development (the default under Vitest)", async () => {
    const response = await GET();

    expect(response.status).toBe(404);
    expect(cookieJar.get("admin_session")).toBeUndefined();
  });

  it("answers not found even when admin emails are configured, outside development", async () => {
    vi.stubEnv("ADMIN_EMAILS", "reviewer@example.com");

    const response = await GET();

    expect(response.status).toBe(404);
  });

  describe("in development", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
    });

    it("signs in as the first technical admin and redirects to /admin", async () => {
      vi.stubEnv("TECH_ADMIN_EMAILS", "tech@example.com");
      vi.stubEnv("ADMIN_EMAILS", "reviewer@example.com,tech@example.com");

      const response = await GET();

      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe("/admin");
      expect(cookieJar.get("admin_session")?.value).toBeTruthy();
    });

    it("falls back to the first admin email when no technical admin is configured", async () => {
      vi.stubEnv("TECH_ADMIN_EMAILS", "");
      vi.stubEnv("ADMIN_EMAILS", "reviewer@example.com");

      const response = await GET();

      expect(response.status).toBe(303);
      expect(cookieJar.get("admin_session")?.value).toBeTruthy();
    });

    it("answers with a clear message when no admin email is configured", async () => {
      vi.stubEnv("TECH_ADMIN_EMAILS", "");
      vi.stubEnv("ADMIN_EMAILS", "");

      const response = await GET();

      expect(response.status).toBe(400);
      expect(await response.text()).toMatch(/ADMIN_EMAILS/);
      expect(cookieJar.get("admin_session")).toBeUndefined();
    });
  });
});
