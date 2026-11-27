import { NextResponse } from "next/server";
import { requireAdminOrNewsRadarKey } from "@/lib/admin-guard";
import { recordAdminAction } from "@/lib/audit-log";
import { getNewsRadarSettings, saveNewsRadarSettings } from "@/lib/news-radar-store";
import { parseTuning, readJsonObject } from "@/news-radar/api";

/**
 * The News radar's topics and trusted outlets, as on /admin/news-radar/settings. The recipient of
 * the weekly email is neither shown nor changed here: only a technical admin sets it, on that page.
 */
export async function GET(request: Request) {
  const session = await requireAdminOrNewsRadarKey(request);
  if (session instanceof NextResponse) return session;
  const settings = await getNewsRadarSettings();
  return NextResponse.json({ topics: settings.topics, trustedOutlets: settings.trustedOutlets, updatedAt: settings.updatedAt });
}

/** Replaces the topics and trusted outlets with the body's; the recipient stays as it is. */
export async function PUT(request: Request) {
  const session = await requireAdminOrNewsRadarKey(request);
  if (session instanceof NextResponse) return session;
  const parsed = parseTuning(await readJsonObject(request));
  if (!parsed.ok) return NextResponse.json({ error: parsed.problem }, { status: 400 });
  const current = await getNewsRadarSettings();
  await saveNewsRadarSettings({ ...parsed.tuning, recipient: current.recipient }, session.email);
  await recordAdminAction({
    actorEmail: session.email,
    action: "news_radar_settings",
    detail: { topics: parsed.tuning.topics.map((t) => t.id), recipientChanged: false },
  });
  return NextResponse.json({ topics: parsed.tuning.topics, trustedOutlets: parsed.tuning.trustedOutlets });
}
