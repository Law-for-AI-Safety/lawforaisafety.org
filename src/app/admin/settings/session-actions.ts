"use server";

import { z } from "zod";
import { recordAdminAction } from "@/lib/audit-log";
import { endSessionsOf, getAdminSession, isTechAdminEmail } from "@/lib/session";

export type EndSessionsResult = { ok: true; ended: number } | { ok: false; message: string };

/**
 * Logs someone out everywhere: every live session of theirs ends, and each device is signed
 * out at its next request. Technical admins only; checked here on every call.
 */
export async function endSessions(email: unknown): Promise<EndSessionsResult> {
  const actor = await getAdminSession();
  if (!actor) return { ok: false, message: "You are signed out. Sign in again in a new tab, then retry." };
  if (!isTechAdminEmail(actor.email)) return { ok: false, message: "Only technical admins can end sessions." };
  const target = z.string().min(1).max(320).safeParse(email);
  if (!target.success) return { ok: false, message: "The request was not understood." };

  const ended = await endSessionsOf(target.data, actor.email);
  await recordAdminAction({
    actorEmail: actor.email,
    action: "sessions_end",
    detail: { email: target.data.toLowerCase(), ended },
  });
  return { ok: true, ended };
}
