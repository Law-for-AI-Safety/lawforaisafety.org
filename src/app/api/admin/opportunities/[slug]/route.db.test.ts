import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminSessions, opportunities, opportunitiesAuditLog } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { startAdminSession } from "@/lib/session";
import { DELETE, PATCH } from "./route";

vi.mock("next/headers", () => import("../../../../../../test/next-headers"));

const SLUG = "fixture-job";
const EXISTING = {
  slug: SLUG,
  type: "job" as const,
  title: "Fixture Job",
  org: "Fixture Org",
  summary: "A short summary.",
  description: "A longer description.",
  location: "Remote",
  remote: true,
  applyUrl: "https://example.com/apply",
  publishedAt: "2026-01-01",
  createdBy: "admin@example.com",
};

function request(method: "PATCH" | "DELETE", body?: unknown) {
  return new Request(`http://localhost:3001/api/admin/opportunities/${SLUG}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ slug: SLUG }) };

beforeEach(async () => {
  await db.delete(adminSessions);
  await db.delete(opportunitiesAuditLog);
  await db.delete(opportunities);
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  await db.insert(opportunities).values(EXISTING);
});

describe("PATCH /api/admin/opportunities/[slug]", () => {
  it("is unauthorized when signed out", async () => {
    const response = await PATCH(request("PATCH", { ...EXISTING, title: "New Title" }), params);
    expect(response.status).toBe(401);
  });

  it("saves the edited fields, keeping the slug and published date", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await PATCH(request("PATCH", { ...EXISTING, title: "New Title" }), params);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.slug).toBe(SLUG);
    expect(data.title).toBe("New Title");
    expect(data.publishedAt).toBe(EXISTING.publishedAt);
  });

  it("404s a slug that isn't on the live site", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await PATCH(
      request("PATCH", { ...EXISTING, title: "x" }),
      { params: Promise.resolve({ slug: "no-such-slug" }) },
    );
    expect(response.status).toBe(404);
  });

  it("rejects a request missing required fields", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await PATCH(request("PATCH", { ...EXISTING, title: "" }), params);
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/admin/opportunities/[slug]", () => {
  it("is unauthorized when signed out", async () => {
    const response = await DELETE(request("DELETE"), params);
    expect(response.status).toBe(401);
  });

  it("removes the listing", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await DELETE(request("DELETE"), params);
    expect(response.status).toBe(200);

    const remaining = await db.select().from(opportunities);
    expect(remaining).toEqual([]);
  });

  it("404s a slug that isn't on the live site", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await DELETE(request("DELETE"), { params: Promise.resolve({ slug: "no-such-slug" }) });
    expect(response.status).toBe(404);
  });
});
