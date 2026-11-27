import { NextResponse } from "next/server";
import { requireAdminOrNewsRadarKey } from "@/lib/admin-guard";
import { recordAdminAction } from "@/lib/audit-log";
import { getNewsRadarSettings, saveNewsRadarTuning } from "@/lib/news-radar-store";
import { parseBasedOn, parseTuning, readJsonObject } from "@/news-radar/api";

/**
 * The News radar's topics and trusted outlets, as on /admin/news-radar/settings. The recipient of
 * the weekly email is neither shown nor changed here: only a technical admin sets it, on that page.
 * `updatedAt` says which save these are; a PUT sends it back.
 */
export async function GET(request: Request) {
  const session = await requireAdminOrNewsRadarKey(request);
  if (session instanceof NextResponse) return session;
  const settings = await getNewsRadarSettings();
  return NextResponse.json({ topics: settings.topics, trustedOutlets: settings.trustedOutlets, updatedAt: settings.updatedAt });
}

/**
 * Replaces the topics and trusted outlets with the body's; the recipient stays as it is. The body
 * carries the `updatedAt` it was based on, and is refused with 409 if the settings were saved
 * again since, so an agent never overwrites a change it has not seen.
 */
export async function PUT(request: Request) {
  const session = await requireAdminOrNewsRadarKey(request);
  if (session instanceof NextResponse) return session;
  const body = await readJsonObject(request);
  const parsed = parseTuning(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.problem }, { status: 400 });
  const basedOn = parseBasedOn(body?.updatedAt);
  if (!basedOn.ok) return NextResponse.json({ error: basedOn.problem }, { status: 400 });
  if (!(await saveNewsRadarTuning(parsed.tuning, session.email, basedOn.basedOn))) {
    return NextResponse.json(
      { error: "The settings have changed since this file was based on them. Get them again and redo the change." },
      { status: 409 },
    );
  }
  await recordAdminAction({
    actorEmail: session.email,
    action: "news_radar_settings",
    detail: { topics: parsed.tuning.topics.map((t) => t.id), recipientChanged: false },
  });
  const saved = await getNewsRadarSettings();
  return NextResponse.json({ topics: saved.topics, trustedOutlets: saved.trustedOutlets, updatedAt: saved.updatedAt });
}
