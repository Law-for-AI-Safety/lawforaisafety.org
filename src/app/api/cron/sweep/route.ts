import { NextResponse } from "next/server";
import { sweepOldDrafts } from "@/lib/applicant-flow";
import { sweepOldRedLinesDrafts, sweepRejectedRedLinesApplications } from "@/lib/red-lines-flow";
import { sweepDecidedSubmissions, sweepOldSubmissionDrafts } from "@/lib/opportunity-submission-flow";
import { sweepUnconfirmedSignups } from "@/lib/newsletter-signup";
import { announceRecentlyClosed } from "@/lib/opportunities-flow";
import { sweepRateLimitHits } from "@/lib/rate-limit";
import { hasBearerSecret } from "@/lib/timing-safe-equal";

/**
 * How often netlify/functions/sweep-expired-data.mts calls this route, so each run announces
 * the opportunities that closed since the one before.
 */
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Deletes everything that has outlived the retention periods the privacy
 * policy states: abandoned application drafts and their CVs, and opportunity submissions never
 * confirmed (24 hours), newsletter signups never confirmed (7 days), opportunity submissions
 * decided and Red Lines Dialogues applications rejected over a year ago, and rate-limit
 * counters (1 hour). It also tells the search engines about opportunities that have closed since
 * the last run (see `announceRecentlyClosed`).
 *
 * Called every 6 hours by netlify/functions/sweep-expired-data.mts. The sweeps also
 * run opportunistically when someone submits a form, but on a quiet site
 * that could be days apart — this is what makes the stated periods true.
 *
 * Publicly reachable, so it takes a shared secret and fails closed without
 * one. It accepts no input and only ever deletes what is already expired, so
 * the worst a leaked secret allows is running the clean-up early.
 */
export async function POST(request: Request) {
  if (!hasBearerSecret(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    drafts,
    redLinesDrafts,
    rejectedRedLines,
    submissionDrafts,
    decidedSubmissions,
    newsletterSignups,
    rateLimitHits,
    closedOpportunities,
  ] = await Promise.all([
    sweepOldDrafts(),
    sweepOldRedLinesDrafts(),
    sweepRejectedRedLinesApplications(),
    sweepOldSubmissionDrafts(),
    sweepDecidedSubmissions(),
    sweepUnconfirmedSignups(),
    sweepRateLimitHits(),
    announceRecentlyClosed(new Date(), SWEEP_INTERVAL_MS),
  ]);

  const result = {
    drafts,
    redLinesDrafts,
    rejectedRedLines,
    submissionDrafts,
    decidedSubmissions,
    newsletterSignups,
    rateLimitHits,
    closedOpportunities,
  };
  console.log(`[cron] Swept expired data: ${JSON.stringify(result)}`);
  return NextResponse.json(result);
}
