import { NextResponse } from "next/server";
import { startNewsRadarRun } from "@/news-radar/start";
import { hasBearerSecret } from "@/lib/timing-safe-equal";

/**
 * Starts the weekly News radar run: it searches the sources, stores what is relevant, and emails
 * the team group its summary (src/news-radar/run.ts). Called on Monday mornings by
 * netlify/functions/news-radar.mts. On Netlify the run goes on in a background function after
 * this answers (src/news-radar/start.ts); its result is on the admin page and in that function's log.
 *
 * Publicly reachable, so it takes the same shared secret as the sweep and fails closed without
 * it. It accepts no input; the worst a leaked secret allows is extra runs, each a handful of
 * requests to free public APIs and one email to the team's own group.
 */
export async function POST(request: Request) {
  if (!hasBearerSecret(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { runId } = await startNewsRadarRun({ trigger: "schedule" });
  console.log(`[cron] News radar started: run ${runId}`);
  return NextResponse.json({ runId }, { status: 202 });
}
