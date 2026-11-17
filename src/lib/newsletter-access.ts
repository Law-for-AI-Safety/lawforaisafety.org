import { getAdminSession, type AdminSessionPayload } from "@/lib/session";

/**
 * Who may write, test, schedule, send, reschedule and cancel the newsletter: every signed-in
 * admin (ADMIN_EMAILS). The session is read from the database on each call, so someone removed
 * from ADMIN_EMAILS, or whose session is ended, is refused on their next request.
 */
export type NewsletterActor = { ok: true } & AdminSessionPayload;
export type NewsletterDenied = { ok: false; reason: "signed_out"; message: string };

export async function requireNewsletter(): Promise<NewsletterActor | NewsletterDenied> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, reason: "signed_out", message: "You are signed out. Sign in again in a new tab, then retry." };
  }
  return { ok: true, ...session };
}
