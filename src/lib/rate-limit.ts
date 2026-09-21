import { createHmac } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimitHits } from "@/drizzle/schema";
import { isNetlifyDeploy } from "@/lib/deploy-context";

/**
 * Fixed-window rate limiter backed by Postgres, keyed by bucket name + client.
 *
 * Netlify's own code-based rate limiting (the `config` export) only applies to
 * native Netlify Functions / Edge Functions, not Next.js Route Handlers run
 * via @netlify/plugin-nextjs, and an in-memory counter is per function
 * instance: it resets on cold start and a flood spread across concurrent
 * instances never trips it. One upsert per form post buys a count every
 * instance agrees on.
 *
 * The client IP is never stored. The key holds an HMAC of it, and rows are
 * deleted an hour after their window opens — long enough to outlive any
 * window used here, short enough that the table is never a log of who visited.
 */

const RETENTION_MS = 60 * 60 * 1000;

function hashClient(ip: string): string {
  // Reuses EMAIL_HASH_SECRET as the key, under its own prefix so an IP hash
  // can never collide with (or be looked up as) an email hash.
  const secret = process.env.EMAIL_HASH_SECRET;
  if (!secret) {
    throw new Error("Missing required env var: EMAIL_HASH_SECRET");
  }
  return createHmac("sha256", secret).update(`rate-limit-ip:${ip}`).digest("hex").slice(0, 32);
}

export async function checkRateLimit(
  bucket: string,
  ip: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): Promise<{ allowed: boolean }> {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const key = `${bucket}:${hashClient(ip)}`;

  try {
    const [row] = await db
      .insert(rateLimitHits)
      .values({ key, windowStart })
      .onConflictDoUpdate({
        target: [rateLimitHits.key, rateLimitHits.windowStart],
        set: { count: sql`${rateLimitHits.count} + 1` },
      })
      .returning({ count: rateLimitHits.count });

    // The hourly scheduled sweep is what keeps the one-hour promise; this is
    // a backstop on roughly one request in twenty, so the table stays small
    // even if the schedule stops firing.
    if (Math.random() < 0.05) await sweepRateLimitHits();

    return { allowed: row.count <= limit };
  } catch (err) {
    // Fails open: every route behind this needs the database anyway, so if it
    // is down the request fails a line later. Turnstile still stands in front.
    console.error("Rate limit check failed", err);
    return { allowed: true };
  }
}

export async function sweepRateLimitHits(): Promise<number> {
  const deleted = await db
    .delete(rateLimitHits)
    .where(lt(rateLimitHits.windowStart, new Date(Date.now() - RETENTION_MS)))
    .returning({ key: rateLimitHits.key });
  return deleted.length;
}

/**
 * On Netlify the edge sets `x-nf-client-connection-ip` and it can't be
 * spoofed. `x-forwarded-for` is whatever the client says it is, so it's only
 * consulted off Netlify (local dev), where there's nothing to abuse. If
 * Netlify's header is ever missing in production, everyone shares the
 * "unknown" bucket — stricter, not looser.
 */
export function getClientIp(request: Request): string {
  const netlifyIp = request.headers.get("x-nf-client-connection-ip");
  if (netlifyIp) return netlifyIp.trim();

  if (!isNetlifyDeploy()) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const first = forwardedFor?.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}
