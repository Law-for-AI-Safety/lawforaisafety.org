import { NextResponse } from "next/server";
import { requireAdminOrNewsRadarKey } from "@/lib/admin-guard";
import { getNewsRadarSettings, itemsBetween } from "@/lib/news-radar-store";
import { ITEM_LIMIT, parseRange } from "@/news-radar/api";
import { exportItem } from "@/news-radar/tuning";

/**
 * The News radar's stored items first seen from `?since=YYYY-MM-DD` (default: the last 90 days)
 * up to `?until=YYYY-MM-DD` (default: now), newest first, each with its triage state and the
 * include keywords it matches under the current settings. For an agent judging how well the
 * radar's topics fit; see news-radar-tuning.md.
 */
export async function GET(request: Request) {
  const session = await requireAdminOrNewsRadarKey(request);
  if (session instanceof NextResponse) return session;
  const params = new URL(request.url).searchParams;
  const range = parseRange(params.get("since"), params.get("until"), new Date());
  if (!range.ok) return NextResponse.json({ error: range.problem }, { status: 400 });
  const [settings, rows] = await Promise.all([getNewsRadarSettings(), itemsBetween(range.since, range.until, ITEM_LIMIT + 1)]);
  return NextResponse.json({
    since: range.since.toISOString(),
    until: range.until?.toISOString() ?? null,
    truncated: rows.length > ITEM_LIMIT,
    items: rows.slice(0, ITEM_LIMIT).map((row) => exportItem(row, settings)),
  });
}
