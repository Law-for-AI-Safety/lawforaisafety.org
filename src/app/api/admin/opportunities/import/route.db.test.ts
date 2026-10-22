import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminSessions } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { startAdminSession } from "@/lib/session";
import { github, githubEnv } from "../../../../../../test/fakes/github";
import { POST } from "./route";

vi.mock("next/headers", () => import("../../../../../../test/next-headers"));

function request(body: unknown) {
  return new Request("http://localhost:3001/api/admin/opportunities/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await db.delete(adminSessions);
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  for (const [name, value] of Object.entries(githubEnv())) vi.stubEnv(name, value);
});

describe("POST /api/admin/opportunities/import", () => {
  it("is unauthorized when signed out", async () => {
    const response = await POST(request({ url: "https://example.com/job" }));
    expect(response.status).toBe(401);
  });

  it("opens a pull request with a stub file containing only the url", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await POST(request({ url: "https://example.com/careers/role" }));
    expect(response.status).toBe(200);

    const [pr] = github.openedPRs;
    const [[, text]] = Object.entries(pr.files);
    expect(JSON.parse(text)).toEqual({ url: "https://example.com/careers/role" });
  });

  it("rejects a request without a url", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await POST(request({}));
    expect(response.status).toBe(400);
  });
});
