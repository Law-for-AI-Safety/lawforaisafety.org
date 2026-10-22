import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminSessions } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { startAdminSession } from "@/lib/session";
import { github, githubEnv } from "../../../../../test/fakes/github";
import { POST } from "./route";

vi.mock("next/headers", () => import("../../../../../test/next-headers"));

function request(body: unknown) {
  return new Request("http://localhost:3001/api/admin/opportunities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  type: "job",
  title: "Acme Senior Role",
  org: "Acme",
  summary: "A short summary.",
  description: "A longer description.",
  location: "Remote",
  remote: true,
  applyUrl: "https://example.com/apply",
};

beforeEach(async () => {
  await db.delete(adminSessions);
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  for (const [name, value] of Object.entries(githubEnv())) vi.stubEnv(name, value);
});

describe("POST /api/admin/opportunities", () => {
  it("is unauthorized when signed out", async () => {
    const response = await POST(request(VALID_BODY));
    expect(response.status).toBe(401);
  });

  it("is forbidden for an admin outside the opportunities team", async () => {
    vi.stubEnv("OPPORTUNITIES_TEAM_EMAILS", "someone-else@example.com");
    await startAdminSession({ email: "admin@example.com", name: "Admin" });
    const response = await POST(request(VALID_BODY));
    expect(response.status).toBe(403);
  });

  it("opens a pull request adding the new opportunity, with a server-computed slug", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await POST(request(VALID_BODY));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ number: 1, url: expect.any(String), branch: "opportunities/acme-acme-senior-role-" + new Date().toISOString().slice(0, 10) });

    const [pr] = github.openedPRs;
    const [[, text]] = Object.entries(pr.files);
    const written = JSON.parse(text);
    expect(written.slug).toBe("acme-acme-senior-role");
    expect(written.title).toBe("Acme Senior Role");
  });

  it("keeps the source URL when the admin fills one in", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await POST(request({ ...VALID_BODY, sourceUrl: "https://example.com/original-posting" }));
    expect(response.status).toBe(200);

    const [pr] = github.openedPRs;
    const [[, text]] = Object.entries(pr.files);
    expect(JSON.parse(text).sourceUrl).toBe("https://example.com/original-posting");
  });

  it("rejects a request missing required fields", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await POST(request({ title: "" }));
    expect(response.status).toBe(400);
  });

  it("reports when GitHub publishing is not configured", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    vi.stubEnv("GITHUB_APP_ID", "");
    const response = await POST(request(VALID_BODY));
    expect(response.status).toBe(503);
  });
});
