"use server";

import { checkGitHubConnection, type ConnectionCheck } from "@/lib/cms-publishing";
import { getAdminSession, isTechAdminEmail } from "@/lib/session";

export type CheckConnectionResult = ConnectionCheck | { ok: false; message: string; setup?: undefined };

/**
 * Checks that the site can reach GitHub as its App, with a read-only call (the head of main).
 * Technical admins only; checked here on every call.
 */
export async function checkPublishingConnection(): Promise<CheckConnectionResult> {
  const actor = await getAdminSession();
  if (!actor) return { ok: false, message: "You are signed out. Sign in again in a new tab, then retry." };
  if (!isTechAdminEmail(actor.email)) return { ok: false, message: "Only technical admins can check the publishing connection." };
  return checkGitHubConnection();
}
