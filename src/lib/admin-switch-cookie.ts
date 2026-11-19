import { cookies } from "next/headers";

/**
 * Marks a Google login as the "Switch to Google" step of the admin signed in with LinkedIn in
 * this browser. Only that click links their LinkedIn address to the Workspace account they
 * then sign in with: a Google login started anywhere else, such as another admin using the
 * login page on a shared browser, must not close somebody else's LinkedIn login.
 */
const COOKIE_NAME = "admin_switch_from";
// As long as the OAuth state it travels with (admin-oauth-state.ts).
const MAX_AGE_SECONDS = 60 * 10;

/** Starting a Google login: remembers who asked to switch, or forgets any earlier request. */
export async function setSwitchFrom(email: string | null): Promise<void> {
  const cookieStore = await cookies();
  if (!email) {
    cookieStore.delete(COOKIE_NAME);
    return;
  }
  cookieStore.set(COOKIE_NAME, email.toLowerCase(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Back from Google: who asked to switch, if anyone. Read once, then forgotten. */
export async function takeSwitchFrom(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value ?? null;
  cookieStore.delete(COOKIE_NAME);
  return value;
}
