import { NextResponse } from "next/server";
import { requireAdminOrNewsRadarKey } from "@/lib/admin-guard";
import { getNewsRadarSettings, itemsBetween } from "@/lib/news-radar-store";
import { ITEM_LIMIT, parseRange, parseTuning, readJsonObject } from "@/news-radar/api";
import { rescore } from "@/news-radar/tuning";

/**
 * A dry run of proposed settings: the body holds topics and trusted outlets as for PUT
 * /api/admin/news-radar/settings, and optionally `since` and `until` as for GET items. Says how
 * each item stored in that stretch scores now and would score, and which it would keep or drop,
 * tallied by triage state. Saves nothing, so it is a POST only because it takes a body.
 */
export async function POST(request: Request) {
  const session = await requireAdminOrNewsRadarKey(request);
  if (session instanceof NextResponse) return session;
  const body = await readJsonObject(request);
  const parsed = parseTuning(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.problem }, { status: 400 });
  const range = parseRange(body?.since, body?.until, new Date());
  if (!range.ok) return NextResponse.json({ error: range.problem }, { status: 400 });
  const [settings, rows] = await Promise.all([getNewsRadarSettings(), itemsBetween(range.since, range.until, ITEM_LIMIT + 1)]);
  const result = rescore(rows.slice(0, ITEM_LIMIT), settings, parsed.tuning);
  return NextResponse.json({
    since: range.since.toISOString(),
    until: range.until?.toISOString() ?? null,
    truncated: rows.length > ITEM_LIMIT,
    ...result,
  });
}
