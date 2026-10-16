import { beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimitHits } from "@/drizzle/schema";
import { checkRateLimit, sweepRateLimitHits } from "@/lib/rate-limit";

const WINDOW = { limit: 2, windowMs: 60_000 };
const START = new Date("2026-10-15T12:00:00Z").getTime();

beforeEach(async () => {
  await db.delete(rateLimitHits);
  vi.useFakeTimers({ toFake: ["Date"], now: START });
  // The opportunistic sweep runs on a random fraction of requests; tests choose when.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

describe("checkRateLimit", () => {
  it("allows up to the limit in one window, then refuses", async () => {
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await checkRateLimit("newsletter", "203.0.113.7", WINDOW));

    expect(results.map((r) => r.allowed)).toEqual([true, true, false]);
  });

  it("counts each client separately", async () => {
    await checkRateLimit("newsletter", "203.0.113.7", WINDOW);
    await checkRateLimit("newsletter", "203.0.113.7", WINDOW);

    expect(await checkRateLimit("newsletter", "198.51.100.1", WINDOW)).toEqual({ allowed: true });
  });

  it("counts each bucket separately", async () => {
    await checkRateLimit("newsletter", "203.0.113.7", WINDOW);
    await checkRateLimit("newsletter", "203.0.113.7", WINDOW);

    expect(await checkRateLimit("apply", "203.0.113.7", WINDOW)).toEqual({ allowed: true });
  });

  it("starts a fresh count in the next window", async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit("newsletter", "203.0.113.7", WINDOW);

    vi.setSystemTime(START + WINDOW.windowMs);

    expect(await checkRateLimit("newsletter", "203.0.113.7", WINDOW)).toEqual({ allowed: true });
  });

  it("never stores the client's IP address", async () => {
    await checkRateLimit("newsletter", "203.0.113.7", WINDOW);

    const rows = await db.select().from(rateLimitHits);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toMatch(/^newsletter:[0-9a-f]{32}$/);
    expect(JSON.stringify(rows)).not.toContain("203.0.113.7");
  });

  it("sweeps expired windows on the occasional request", async () => {
    await checkRateLimit("newsletter", "203.0.113.7", WINDOW);
    vi.setSystemTime(START + 2 * 60 * 60 * 1000);
    vi.mocked(Math.random).mockReturnValue(0.01);

    await checkRateLimit("newsletter", "198.51.100.1", WINDOW);

    const rows = await db.select().from(rateLimitHits);
    expect(rows).toHaveLength(1);
    expect(rows[0].windowStart.getTime()).toBe(START + 2 * 60 * 60 * 1000);
  });

  it("fails open when the database cannot be written", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await db.execute(sql`ALTER TABLE rate_limit_hits RENAME TO rate_limit_hits_unavailable`);
    try {
      expect(await checkRateLimit("newsletter", "203.0.113.7", { limit: 0, windowMs: 60_000 })).toEqual(
        { allowed: true },
      );
      expect(console.error).toHaveBeenCalledWith("Rate limit check failed", expect.any(Error));
    } finally {
      await db.execute(sql`ALTER TABLE rate_limit_hits_unavailable RENAME TO rate_limit_hits`);
    }
  });

  it("refuses to run without the hashing secret", async () => {
    vi.stubEnv("EMAIL_HASH_SECRET", "");

    await expect(checkRateLimit("newsletter", "203.0.113.7", WINDOW)).rejects.toThrow(
      "Missing required env var: EMAIL_HASH_SECRET",
    );
  });
});

describe("sweepRateLimitHits", () => {
  it("deletes windows that opened more than an hour ago and keeps the rest", async () => {
    await checkRateLimit("newsletter", "203.0.113.7", WINDOW);
    vi.setSystemTime(START + 30 * 60 * 1000);
    await checkRateLimit("newsletter", "198.51.100.1", WINDOW);
    vi.setSystemTime(START + 60 * 60 * 1000 + 1);

    expect(await sweepRateLimitHits()).toBe(1);
    expect(await db.select().from(rateLimitHits)).toHaveLength(1);
  });
});
