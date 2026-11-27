"use server";

import { z } from "zod";
import { recordAdminAction } from "@/lib/audit-log";
import { getAdminSession, isTechAdminEmail } from "@/lib/session";
import { getNewsRadarSettings, saveNewsRadarSettings, setItemState } from "@/lib/news-radar-store";
import { runNewsRadar } from "@/news-radar/run";
import { parseSettings } from "@/news-radar/settings";
import type { Topic } from "@/news-radar/types";

/**
 * The News radar's server actions. Each is a public endpoint, so each reads the caller's session
 * from the database and checks every argument itself. Any admin may triage and change the
 * topics; only a technical admin may run the radar by hand or change where the weekly email goes.
 */

export type Refusal = { ok: false; message: string };
const SIGNED_OUT: Refusal = { ok: false, message: "You are signed out. Sign in again in a new tab, then retry." };
const INVALID: Refusal = { ok: false, message: "The request was not understood." };
const TECH_ONLY: Refusal = { ok: false, message: "Only technical admins can do this." };

const id = z.uuid();
const state = z.enum(["new", "useful", "dismissed"]);

/** Sets the state of an item, and of the other outlets' copies of its story shown with it (see setItemState). */
export async function triageItem(itemId: unknown, newState: unknown, copyIds: unknown = []): Promise<{ ok: true } | Refusal> {
  const session = await getAdminSession();
  if (!session) return SIGNED_OUT;
  const parsedId = id.safeParse(itemId);
  const parsedState = state.safeParse(newState);
  // As many copies as the page can show (listItems' limit).
  const parsedCopies = z.array(id).max(500).safeParse(copyIds);
  if (!parsedId.success || !parsedState.success || !parsedCopies.success) return INVALID;
  if (!(await setItemState(parsedId.data, parsedState.data, session.email, parsedCopies.data))) {
    return { ok: false, message: "That item no longer exists." };
  }
  return { ok: true };
}

export async function runNow(): Promise<{ ok: true; newCount: number; seenCount: number; failed: number } | Refusal> {
  const session = await getAdminSession();
  if (!session) return SIGNED_OUT;
  if (!isTechAdminEmail(session.email)) return TECH_ONLY;
  const result = await runNewsRadar({ trigger: "manual", triggeredBy: session.email });
  await recordAdminAction({ actorEmail: session.email, action: "news_radar_run", detail: { runId: result.runId } });
  return { ok: true, newCount: result.newCount, seenCount: result.seenCount, failed: result.sources.filter((s) => !s.ok).length };
}

/**
 * Saves the topics and trusted outlets; the recipient only changes when a technical admin saves.
 * Returns the topics as saved, so the form keeps the ids given to new ones.
 */
export async function saveSettings(input: unknown): Promise<{ ok: true; topics: Topic[] } | Refusal> {
  const session = await getAdminSession();
  if (!session) return SIGNED_OUT;
  const parsed = parseSettings(input);
  if (!parsed.ok) return { ok: false, message: parsed.problem };
  const tech = isTechAdminEmail(session.email);
  const current = await getNewsRadarSettings();
  const settings = tech ? parsed.settings : { ...parsed.settings, recipient: current.recipient };
  await saveNewsRadarSettings(settings, session.email);
  await recordAdminAction({
    actorEmail: session.email,
    action: "news_radar_settings",
    detail: { topics: settings.topics.map((t) => t.id), recipientChanged: settings.recipient !== current.recipient },
  });
  return { ok: true, topics: settings.topics };
}
