import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sweepOldDrafts } from "@/lib/applicant-flow";
import { sweepOldRedLinesDrafts } from "@/lib/red-lines-flow";
import { sweepUnconfirmedSignups } from "@/lib/newsletter-signup";
import { sweepRateLimitHits } from "@/lib/rate-limit";

/**
 * Deletes everything that has outlived the retention periods the privacy
 * policy states: abandoned application drafts and their CVs (24 hours),
 * newsletter signups never confirmed (7 days), rate-limit counters (1 hour).
 *
 * Called hourly by netlify/functions/sweep-expired-data.mts. The sweeps also
 * run opportunistically when someone submits a form, but on a quiet site
 * that could be days apart — this is what makes the stated periods true.
 *
 * Publicly reachable, so it takes a shared secret and fails closed without
 * one. It accepts no input and only ever deletes what is already expired, so
 * the worst a leaked secret allows is running the clean-up early.
 */
function isAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [drafts, redLinesDrafts, newsletterSignups, rateLimitHits] = await Promise.all([
    sweepOldDrafts(),
    sweepOldRedLinesDrafts(),
    sweepUnconfirmedSignups(),
    sweepRateLimitHits(),
  ]);

  const result = { drafts, redLinesDrafts, newsletterSignups, rateLimitHits };
  console.log(`[cron] Swept expired data: ${JSON.stringify(result)}`);
  return NextResponse.json(result);
}
