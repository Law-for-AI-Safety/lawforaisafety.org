import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminSessions, opportunities, opportunitiesAuditLog } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { startAdminSession } from "@/lib/session";
import { GET, POST } from "./route";

vi.mock("next/headers", () => import("../../../../../test/next-headers"));

function request(body: unknown, headers?: HeadersInit) {
  return new Request("http://localhost:3001/api/admin/opportunities", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function listRequest(headers?: HeadersInit) {
  return new Request("http://localhost:3001/api/admin/opportunities", { headers });
}

const VALID_BODY = {
  type: "job",
  title: "Acme Senior Role",
  org: "Acme",
  summary: "A short summary.",
  description: "A longer description.",
  locationCountry: "GLOBAL",
  remote: true,
  applyUrl: "https://example.com/apply",
};

beforeEach(async () => {
  await db.delete(adminSessions);
  await db.delete(opportunitiesAuditLog);
  await db.delete(opportunities);
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
});

describe("GET /api/admin/opportunities", () => {
  it("is unauthorized when signed out", async () => {
    const response = await GET(listRequest());
    expect(response.status).toBe(401);
  });

  it("lists every opportunity for a signed-in admin", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    await POST(request(VALID_BODY));
    const response = await GET(listRequest());
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe(VALID_BODY.title);
  });

  it("lists every opportunity for a valid API key, with no session", async () => {
    vi.stubEnv("OPPORTUNITIES_API_KEY", "test-key");
    await POST(request(VALID_BODY, { authorization: "Bearer test-key" }));
    const response = await GET(listRequest({ authorization: "Bearer test-key" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(1);
  });

  it("rejects the wrong API key", async () => {
    vi.stubEnv("OPPORTUNITIES_API_KEY", "test-key");
    const response = await GET(listRequest({ authorization: "Bearer wrong-key" }));
    expect(response.status).toBe(401);
  });
});

describe("POST /api/admin/opportunities", () => {
  it("is unauthorized when signed out", async () => {
    const response = await POST(request(VALID_BODY));
    expect(response.status).toBe(401);
  });

  it("creates the opportunity via a valid API key, with no session", async () => {
    vi.stubEnv("OPPORTUNITIES_API_KEY", "test-key");
    const response = await POST(request(VALID_BODY, { authorization: "Bearer test-key" }));
    expect(response.status).toBe(200);
    const [row] = await db.select().from(opportunities);
    expect(row.createdBy).toBe("ingestion@api");
  });

  it("rejects the wrong API key", async () => {
    vi.stubEnv("OPPORTUNITIES_API_KEY", "test-key");
    const response = await POST(request(VALID_BODY, { authorization: "Bearer wrong-key" }));
    expect(response.status).toBe(401);
  });

  it("is forbidden for an admin outside the opportunities team", async () => {
    vi.stubEnv("OPPORTUNITIES_TEAM_EMAILS", "someone-else@example.com");
    await startAdminSession({ email: "admin@example.com", name: "Admin" });
    const response = await POST(request(VALID_BODY));
    expect(response.status).toBe(403);
  });

  it("creates the opportunity, live immediately, with a server-computed slug", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await POST(request(VALID_BODY));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({ slug: "acme-acme-senior-role", title: "Acme Senior Role", publishedAt: new Date().toISOString().slice(0, 10) });

    const [row] = await db.select().from(opportunities);
    expect(row.slug).toBe("acme-acme-senior-role");
    expect(row.createdBy).toBe("admin@example.com");
  });

  it("keeps the source URL when the admin fills one in", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await POST(request({ ...VALID_BODY, sourceUrl: "https://example.com/original-posting" }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sourceUrl).toBe("https://example.com/original-posting");
  });

  it("rejects a request missing required fields", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await POST(request({ title: "" }));
    expect(response.status).toBe(400);
  });
});
