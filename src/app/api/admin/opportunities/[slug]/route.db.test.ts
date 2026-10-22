import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminSessions } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { opportunityFilePath, printOpportunity } from "@/opportunities/files";
import type { Opportunity } from "@/opportunities/types";
import { startAdminSession } from "@/lib/session";
import { github, githubEnv } from "../../../../../../test/fakes/github";
import { withOpportunities } from "../../../../../../test/fakes/opportunities-dir";
import { DELETE, PATCH } from "./route";

vi.mock("next/headers", () => import("../../../../../../test/next-headers"));

const SLUG = "fixture-job";
const EXISTING: Opportunity = {
  slug: SLUG,
  type: "job",
  title: "Fixture Job",
  org: "Fixture Org",
  summary: "A short summary.",
  description: "A longer description.",
  location: "Remote",
  remote: true,
  applyUrl: "https://example.com/apply",
  publishedAt: "2026-01-01",
};

function request(method: "PATCH" | "DELETE", body?: unknown) {
  return new Request(`http://localhost:3001/api/admin/opportunities/${SLUG}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ slug: SLUG }) };

let restore: () => void;
beforeEach(async () => {
  await db.delete(adminSessions);
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  for (const [name, value] of Object.entries(githubEnv())) vi.stubEnv(name, value);
  github.fileOnMain(opportunityFilePath(SLUG), printOpportunity(EXISTING));
  restore = withOpportunities([EXISTING]).restore;
});
afterEach(() => restore());

describe("PATCH /api/admin/opportunities/[slug]", () => {
  it("is unauthorized when signed out", async () => {
    const response = await PATCH(request("PATCH", { ...EXISTING, title: "New Title" }), params);
    expect(response.status).toBe(401);
  });

  it("opens a pull request with the edited fields, keeping the slug", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await PATCH(request("PATCH", { ...EXISTING, title: "New Title" }), params);
    expect(response.status).toBe(200);

    const [pr] = github.openedPRs;
    const [[, text]] = Object.entries(pr.files);
    const written = JSON.parse(text);
    expect(written.slug).toBe(SLUG);
    expect(written.title).toBe("New Title");
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

  it("opens a pull request removing the listing's file", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await DELETE(request("DELETE"), params);
    expect(response.status).toBe(200);

    const [pr] = github.openedPRs;
    expect(pr.files).toEqual({ [opportunityFilePath(SLUG)]: "(deleted)" });
  });
});
