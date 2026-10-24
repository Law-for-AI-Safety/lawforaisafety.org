import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminSessions, opportunities, opportunitiesAuditLog } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { startAdminSession } from "@/lib/session";
import { DELETE, GET, PATCH } from "./route";

vi.mock("next/headers", () => import("../../../../../../test/next-headers"));

const SLUG = "fixture-job";
const EXISTING = {
  slug: SLUG,
  type: "job" as const,
  title: "Fixture Job",
  org: "Fixture Org",
  summary: "A short summary.",
  description: "A longer description.",
  locationCountry: "GLOBAL",
  remote: true,
  applyUrl: "https://example.com/apply",
  publishedAt: "2026-01-01",
  createdBy: "admin@example.com",
};
const WITH_COMP = {
  ...EXISTING,
  locationCountry: "GB",
  locationCity: "London",
  compMin: 50_000,
  compCurrency: "GBP" as const,
  compPeriod: "year" as const,
};

function request(method: "GET" | "PATCH" | "DELETE", body?: unknown, headers?: HeadersInit) {
  return new Request(`http://localhost:3001/api/admin/opportunities/${SLUG}`, {
    method,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
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

describe("GET /api/admin/opportunities/[slug]", () => {
  it("is unauthorized when signed out", async () => {
    const response = await GET(request("GET"), params);
    expect(response.status).toBe(401);
  });

  it("returns the listing for a signed-in admin", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await GET(request("GET"), params);
    expect(response.status).toBe(200);
    expect((await response.json()).slug).toBe(SLUG);
  });

  it("returns the listing for a valid API key, with no session", async () => {
    vi.stubEnv("OPPORTUNITIES_API_KEY", "test-key");
    const response = await GET(request("GET", undefined, { authorization: "Bearer test-key" }), params);
    expect(response.status).toBe(200);
    expect((await response.json()).slug).toBe(SLUG);
  });

  it("rejects the wrong API key", async () => {
    vi.stubEnv("OPPORTUNITIES_API_KEY", "test-key");
    const response = await GET(request("GET", undefined, { authorization: "Bearer wrong-key" }), params);
    expect(response.status).toBe(401);
  });

  it("404s a slug that isn't on the live site", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await GET(request("GET"), { params: Promise.resolve({ slug: "no-such-slug" }) });
    expect(response.status).toBe(404);
  });
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

  it("clears an optional field left out of the resubmitted form", async () => {
    await db.delete(opportunities);
    await db.insert(opportunities).values(WITH_COMP);
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });

    const response = await PATCH(
      request("PATCH", { ...EXISTING, locationCountry: "GLOBAL" }),
      params,
    );
    expect(response.status).toBe(200);

    const [row] = await db.select().from(opportunities);
    expect(row.locationCity).toBeNull();
    expect(row.compMin).toBeNull();
    expect(row.compCurrency).toBeNull();
  });

  it("saves via a valid API key, with no session", async () => {
    vi.stubEnv("OPPORTUNITIES_API_KEY", "test-key");
    const response = await PATCH(
      request("PATCH", { ...EXISTING, title: "New Title" }, { authorization: "Bearer test-key" }),
      params,
    );
    expect(response.status).toBe(200);

    const [row] = await db.select().from(opportunities);
    expect(row.title).toBe("New Title");
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
