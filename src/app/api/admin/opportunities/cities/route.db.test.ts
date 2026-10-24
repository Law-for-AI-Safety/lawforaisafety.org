import { City } from "country-state-city";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminSessions } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { startAdminSession } from "@/lib/session";
import { GET } from "./route";

vi.mock("next/headers", () => import("../../../../../../test/next-headers"));

function request(country: string) {
  return new Request(`http://localhost:3001/api/admin/opportunities/cities?country=${country}`);
}

beforeEach(async () => {
  await db.delete(adminSessions);
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
});

describe("GET /api/admin/opportunities/cities", () => {
  it("is unauthorized when signed out", async () => {
    const response = await GET(request("GB"));
    expect(response.status).toBe(401);
  });

  it("returns a sorted, deduped list of a country's cities", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await GET(request("GB"));
    expect(response.status).toBe(200);
    const cities: string[] = await response.json();
    expect(cities).toContain("London");
    expect(cities).toEqual([...cities].sort((a, b) => a.localeCompare(b)));
    expect(new Set(cities).size).toBe(cities.length);
  });

  it("returns an empty list for an unknown or missing country", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const response = await GET(request(""));
    expect(await response.json()).toEqual([]);
  });

  it("only looks up a country's cities once, caching the result for later requests", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Jane Editor" });
    const spy = vi.spyOn(City, "getCitiesOfCountry");

    await GET(request("FR"));
    await GET(request("FR"));

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
