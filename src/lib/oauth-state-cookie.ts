import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Binds an OAuth `state` to the browser that started the flow.
 *
 * `state` on its own only proves the callback continues *a* flow this server
 * issued — not that it's the same person. Without this cookie, someone can
 * fill in the apply form, take the provider sign-in URL they're redirected
 * to, and send it to a real lawyer: when the lawyer signs in, the attacker's
 * draft is completed under the lawyer's verified identity. With it, the
 * callback only succeeds in the browser that submitted the form.
 *
 * SameSite=Lax is required, not Strict: the callback is a top-level GET
 * navigation arriving from the provider's site.
 */
const COOKIE_NAMES = {
  applicant: "oauth_state",
  admin: "admin_oauth_state",
  redLinesApplicant: "red_lines_oauth_state",
} as const;

type Flow = keyof typeof COOKIE_NAMES;

// Matches the applicant callback's own one-hour stale-draft cutoff.
const MAX_AGE_SECONDS = 60 * 60;

export async function setOAuthStateCookie(flow: Flow, state: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAMES[flow], state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearOAuthStateCookie(flow: Flow): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAMES[flow]);
}

export async function oauthStateCookieMatches(
  flow: Flow,
  state: string | null,
): Promise<boolean> {
  if (!state) return false;
  const cookieStore = await cookies();
  const expected = cookieStore.get(COOKIE_NAMES[flow])?.value;
  if (!expected) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(state);
  return a.length === b.length && timingSafeEqual(a, b);
}
