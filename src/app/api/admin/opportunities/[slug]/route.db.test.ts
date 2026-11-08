import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminSessions, opportunities, opportunitiesAuditLog } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { startAdminSession } from "@/lib/session";
import { getCachedOpportunities } from "@/opportunities/data";
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

  it("clears an optional field sent as null or blank, as the form sends a cleared one", async () => {
    await db.delete(opportunities);
    await db.insert(opportunities).values(WITH_COMP);
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });

    const response = await PATCH(
      request("PATCH", { ...EXISTING, locationCountry: "GLOBAL", locationCity: null, compMin: null, compCurrency: "", compPeriod: "" }),
      params,
    );
    expect(response.status).toBe(200);

    const [row] = await db.select().from(opportunities);
    expect(row.locationCity).toBeNull();
    expect(row.compMin).toBeNull();
    expect(row.compCurrency).toBeNull();
  });

  it("keeps every field left out of the body, so a script can send only what changes", async () => {
    await db.delete(opportunities);
    await db.insert(opportunities).values({ ...WITH_COMP, tags: ["Policy"], deadline: "2026-12-01" });
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });

    const response = await PATCH(request("PATCH", { title: "New Title" }), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      title: "New Title",
      org: EXISTING.org,
      applyUrl: EXISTING.applyUrl,
      locationCity: "London",
      compMin: 50_000,
      compCurrency: "GBP",
      tags: ["Policy"],
      deadline: "2026-12-01",
      remote: true,
    });
  });

  it("still requires the listing's required fields when one is blanked", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await PATCH(request("PATCH", { org: null }), params);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Title, organisation and apply URL are required" });
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

describe("editing a listing's rounds through PATCH", () => {
  const ROUNDS = [{ label: "Intensive", deadline: "2026-11-15" }, { label: "Part-time", deadline: "2026-12-06" }];
  const body = { ...EXISTING, type: "course" };

  beforeEach(async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
  });

  it("splits single dates into rounds, clearing the listing's own", async () => {
    await db.update(opportunities).set({ deadline: "2026-11-15" });
    const response = await PATCH(request("PATCH", { ...body, rounds: ROUNDS }), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ rounds: ROUNDS });
    const [row] = await db.select().from(opportunities);
    expect(row.deadline).toBeNull();

    const [entry] = await db.select().from(opportunitiesAuditLog);
    expect(entry.detail).toMatchObject({ rounds: { before: null, after: ROUNDS }, deadline: { before: "2026-11-15", after: null } });
  });

  it("returns the rounds from GET", async () => {
    await db.update(opportunities).set({ type: "course", rounds: ROUNDS });
    expect(await (await GET(request("GET"), params)).json()).toMatchObject({ rounds: ROUNDS });
  });

  it("clears the rounds when they are left out or empty", async () => {
    for (const rounds of [undefined, []]) {
      await db.update(opportunities).set({ type: "course", rounds: ROUNDS });
      const response = await PATCH(request("PATCH", { ...body, rounds, deadline: "2026-12-01" }), params);
      expect(response.status).toBe(200);
      expect(await response.json()).not.toHaveProperty("rounds");
      const [row] = await db.select().from(opportunities);
      expect(row.rounds).toBeNull();
      expect(row.deadline).toBe("2026-12-01");
    }
  });

  it("takes only the rounds, dropping the listing's own dates for them", async () => {
    await db.update(opportunities).set({ type: "course", deadline: "2026-11-15", startDate: "2026-11-23" });
    const response = await PATCH(request("PATCH", { rounds: ROUNDS }), params);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({ title: EXISTING.title, rounds: ROUNDS });
    expect(data).not.toHaveProperty("deadline");
    expect(data).not.toHaveProperty("startDate");
  });

  it("takes only a deadline, dropping the listing's rounds for it", async () => {
    await db.update(opportunities).set({ type: "course", rounds: ROUNDS });
    const response = await PATCH(request("PATCH", { deadline: "2026-12-01" }), params);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({ deadline: "2026-12-01" });
    expect(data).not.toHaveProperty("rounds");
  });

  it("is still a 400 for rounds sent alongside the listing's own dates", async () => {
    const response = await PATCH(request("PATCH", { rounds: ROUNDS, deadline: "2026-11-15" }), params);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/keeps its dates in its rounds/);
  });

  it("is a 400 for a bad round, leaving the listing as it was", async () => {
    await db.update(opportunities).set({ type: "course", rounds: ROUNDS });
    const response = await PATCH(request("PATCH", { ...body, rounds: [...ROUNDS, { label: "Round 3" }] }), params);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Round 3: A round needs at least one date" });
    const [row] = await db.select().from(opportunities);
    expect(row.rounds).toEqual(ROUNDS);
  });

  it("saves a draft's rounds as it publishes it", async () => {
    await db.update(opportunities).set({ status: "draft", publishedAt: null });
    const response = await PATCH(request("PATCH", { ...body, publishedAt: undefined, rounds: ROUNDS, status: "published" }), params);
    expect(await response.json()).toMatchObject({ status: "published", rounds: ROUNDS });
  });
});

describe("publishing a draft through PATCH", () => {
  const DRAFT_SLUG = "draft-job";
  const draftParams = { params: Promise.resolve({ slug: DRAFT_SLUG }) };
  function draftRequest(body: unknown, headers?: HeadersInit) {
    return new Request(`http://localhost:3001/api/admin/opportunities/${DRAFT_SLUG}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
    await db.insert(opportunities).values({ ...EXISTING, slug: DRAFT_SLUG, title: "Draft Job", status: "draft", publishedAt: null });
  });

  it("is still found by GET, marked as a draft", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await GET(request("GET"), draftParams);
    expect(await response.json()).toMatchObject({ slug: DRAFT_SLUG, status: "draft" });
  });

  it("publishes on its own, dated the day it goes public, and shows on the public list at once", async () => {
    vi.stubEnv("OPPORTUNITIES_API_KEY", "test-key");
    expect((await getCachedOpportunities()).map((o) => o.slug)).toEqual([SLUG]);

    const response = await PATCH(draftRequest({ status: "published" }, { authorization: "Bearer test-key" }), draftParams);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ slug: DRAFT_SLUG, title: "Draft Job", status: "published", publishedAt: "2026-11-04" });
    expect((await getCachedOpportunities()).map((o) => o.slug).sort()).toEqual([DRAFT_SLUG, SLUG]);

    const entries = await db.select().from(opportunitiesAuditLog);
    expect(entries).toEqual([
      expect.objectContaining({ action: "publish", actorEmail: "ingestion@api", detail: expect.objectContaining({ slug: DRAFT_SLUG, publishedAt: "2026-11-04" }) }),
    ]);
  });

  it("publishes without editing when the body has no fields, only things like its slug", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await PATCH(draftRequest({ status: "published", slug: DRAFT_SLUG, id: "ignored" }), draftParams);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ title: "Draft Job", status: "published", publishedAt: "2026-11-04" });
  });

  it("leaves a draft unpublished and unedited when its edits are invalid", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await PATCH(draftRequest({ ...EXISTING, title: "Edited Draft", compMin: 50_000, status: "published" }), draftParams);
    expect(response.status).toBe(400);
    const [row] = await db.select().from(opportunities).where(eq(opportunities.slug, DRAFT_SLUG));
    expect(row).toMatchObject({ title: "Draft Job", status: "draft", publishedAt: null });
  });

  it("keeps a published listing's date when it is edited with the published status", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await PATCH(request("PATCH", { ...EXISTING, title: "Renamed", status: "published" }), params);
    expect(await response.json()).toMatchObject({ title: "Renamed", publishedAt: EXISTING.publishedAt });
    expect((await db.select().from(opportunitiesAuditLog)).map((entry) => entry.action)).toEqual(["update"]);
  });

  it("saves the edited fields and then publishes", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await PATCH(draftRequest({ ...EXISTING, title: "Edited Draft", status: "published" }), draftParams);
    expect(await response.json()).toMatchObject({ title: "Edited Draft", status: "published", publishedAt: "2026-11-04" });
    const actions = (await db.select().from(opportunitiesAuditLog)).map((entry) => entry.action).sort();
    expect(actions).toEqual(["publish", "update"]);
  });

  it("saves edits to a draft, keeping it a draft, even when the body says so", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await PATCH(draftRequest({ ...EXISTING, title: "Edited Draft", status: "draft" }), draftParams);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ title: "Edited Draft", status: "draft" });
    expect((await getCachedOpportunities()).map((o) => o.slug)).toEqual([SLUG]);
  });

  it("changes nothing when the listing is already published", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await PATCH(request("PATCH", { status: "published" }), params);
    expect(await response.json()).toMatchObject({ slug: SLUG, publishedAt: EXISTING.publishedAt });
    expect(await db.select().from(opportunitiesAuditLog)).toEqual([]);
  });

  it("won't make a published listing a draft again", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await PATCH(request("PATCH", { ...EXISTING, status: "draft" }), params);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "A published listing can't be made a draft again." });
  });

  it("is a 400 for an unknown status", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await PATCH(draftRequest({ status: "live" }), draftParams);
    expect(response.status).toBe(400);
  });

  it("publishes only once when two requests publish it at the same moment", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const responses = await Promise.all([
      PATCH(draftRequest({ status: "published" }), draftParams),
      PATCH(draftRequest({ ...EXISTING, title: "Edited Draft", status: "published" }), draftParams),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const actions = (await db.select().from(opportunitiesAuditLog)).map((entry) => entry.action);
    expect(actions.filter((action) => action === "publish")).toHaveLength(1);
  });

  it("clears the public cache for an edit that lands on a listing published since the form was opened", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    expect((await getCachedOpportunities()).map((o) => o.slug)).toEqual([SLUG]);
    // Published around the flow, so nothing has cleared the cache yet.
    await db.update(opportunities).set({ status: "published", publishedAt: "2026-11-01" }).where(eq(opportunities.slug, DRAFT_SLUG));

    const response = await PATCH(draftRequest({ ...EXISTING, title: "Edited Draft" }), draftParams);
    expect(await response.json()).toMatchObject({ title: "Edited Draft", status: "published", publishedAt: "2026-11-01" });
    expect((await getCachedOpportunities()).find((o) => o.slug === DRAFT_SLUG)?.title).toBe("Edited Draft");
  });

  it("won't save a draft's edits once it has been published, rather than quietly editing it live", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    await db.update(opportunities).set({ status: "published", publishedAt: "2026-11-01" }).where(eq(opportunities.slug, DRAFT_SLUG));
    const response = await PATCH(draftRequest({ ...EXISTING, title: "Edited Draft", status: "draft" }), draftParams);
    expect(response.status).toBe(400);
    const [row] = await db.select().from(opportunities).where(eq(opportunities.slug, DRAFT_SLUG));
    expect(row.title).toBe("Draft Job");
  });

  it("404s keeping a slug that doesn't exist a draft", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await PATCH(draftRequest({ ...EXISTING, status: "draft" }), { params: Promise.resolve({ slug: "no-such-job" }) });
    expect(response.status).toBe(404);
  });

  it("is a 400 for a body that isn't a JSON object", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    for (const body of [null, 42, "published", ["status"]]) {
      const response = await PATCH(draftRequest(body), draftParams);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await response.json()).toEqual({ error: "The body must be a JSON object." });
    }
  });

  it("404s publishing a slug that doesn't exist", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await PATCH(draftRequest({ status: "published" }), { params: Promise.resolve({ slug: "no-such-job" }) });
    expect(response.status).toBe(404);
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
