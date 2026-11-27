import { NextResponse } from "next/server";
import { requireAdminOrNewsRadarKey } from "@/lib/admin-guard";
import { getNewsRadarSettings, itemsSince } from "@/lib/news-radar-store";
import { ITEM_LIMIT, parseSince, parseTuning, readJsonObject } from "@/news-radar/api";
import { rescore } from "@/news-radar/tuning";

/**
 * A dry run of proposed settings: the body holds topics and trusted outlets as for PUT
 * /api/admin/news-radar/settings, and optionally `since` (YYYY-MM-DD, default the last 90 days).
 * Says how each item stored since then scores now and would score, and which it would keep or
 * drop, tallied by triage state. Saves nothing, so it is a POST only because it takes a body.
 */
export async function POST(request: Request) {
  const session = await requireAdminOrNewsRadarKey(request);
  if (session instanceof NextResponse) return session;
  const body = await readJsonObject(request);
  const { since: sinceValue, ...proposed } = body ?? {};
  const parsed = parseTuning(body && proposed);
  if (!parsed.ok) return NextResponse.json({ error: parsed.problem }, { status: 400 });
  const since = parseSince(sinceValue, new Date());
  if (!since.ok) return NextResponse.json({ error: since.problem }, { status: 400 });
  const [settings, rows] = await Promise.all([getNewsRadarSettings(), itemsSince(since.since, ITEM_LIMIT + 1)]);
  const result = rescore(rows.slice(0, ITEM_LIMIT), settings, parsed.tuning);
  return NextResponse.json({ since: since.since.toISOString(), truncated: rows.length > ITEM_LIMIT, ...result });
}
