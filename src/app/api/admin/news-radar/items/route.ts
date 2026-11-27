import { NextResponse } from "next/server";
import { requireAdminOrNewsRadarKey } from "@/lib/admin-guard";
import { getNewsRadarSettings, itemsSince } from "@/lib/news-radar-store";
import { ITEM_LIMIT, parseSince } from "@/news-radar/api";
import { exportItem } from "@/news-radar/tuning";

/**
 * The News radar's stored items first seen since `?since=YYYY-MM-DD` (default: the last 90 days),
 * newest first, each with its triage state and the include keywords it matches under the current
 * settings. For an agent judging how well the radar's topics fit; see news-radar-tuning.md.
 */
export async function GET(request: Request) {
  const session = await requireAdminOrNewsRadarKey(request);
  if (session instanceof NextResponse) return session;
  const since = parseSince(new URL(request.url).searchParams.get("since"), new Date());
  if (!since.ok) return NextResponse.json({ error: since.problem }, { status: 400 });
  const [settings, rows] = await Promise.all([getNewsRadarSettings(), itemsSince(since.since, ITEM_LIMIT + 1)]);
  return NextResponse.json({
    since: since.since.toISOString(),
    truncated: rows.length > ITEM_LIMIT,
    items: rows.slice(0, ITEM_LIMIT).map((row) => exportItem(row, settings)),
  });
}
