import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminSessions, opportunities } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { startAdminSession } from "@/lib/session";
import { GET } from "./route";

vi.mock("next/headers", () => import("../../../../../../test/next-headers"));

function request() {
  return new Request("http://localhost:3001/api/admin/opportunities/tags");
}

beforeEach(async () => {
  await db.delete(adminSessions);
  await db.delete(opportunities);
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
});

describe("GET /api/admin/opportunities/tags", () => {
  it("is unauthorized when signed out", async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
  });

  it("returns every distinct tag in use, sorted", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    await db.insert(opportunities).values([
      {
        slug: "a",
        type: "job",
        title: "A",
        org: "Org",
        summary: "S",
        description: "D",
        locationCountry: "GLOBAL",
        remote: true,
        applyUrl: "https://example.com/a",
        publishedAt: "2026-01-01",
        createdBy: "admin@example.com",
        tags: ["Legal research", "Compliance"],
      },
      {
        slug: "b",
        type: "job",
        title: "B",
        org: "Org",
        summary: "S",
        description: "D",
        locationCountry: "GLOBAL",
        remote: true,
        applyUrl: "https://example.com/b",
        publishedAt: "2026-01-01",
        createdBy: "admin@example.com",
        tags: ["Compliance", "AI governance"],
      },
    ]);

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(["AI governance", "Compliance", "Legal research"]);
  });
});
