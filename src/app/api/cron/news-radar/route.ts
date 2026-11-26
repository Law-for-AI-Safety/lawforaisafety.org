import { NextResponse } from "next/server";
import { runNewsRadar } from "@/news-radar/run";
import { hasBearerSecret } from "@/lib/timing-safe-equal";

/**
 * The weekly News radar run: searches the sources, stores what is relevant, and emails the team
 * group its summary (src/news-radar/run.ts). Called on Monday mornings by
 * netlify/functions/news-radar.mts.
 *
 * Publicly reachable, so it takes the same shared secret as the sweep and fails closed without
 * it. It accepts no input; the worst a leaked secret allows is extra runs, each a handful of
 * requests to free public APIs and one email to the team's own group.
 */
export async function POST(request: Request) {
  if (!hasBearerSecret(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runNewsRadar({ trigger: "schedule" });
  console.log(`[cron] News radar ran: ${JSON.stringify(result)}`);
  return NextResponse.json(result);
}
