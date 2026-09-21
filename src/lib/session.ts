import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "admin_session";
// One working day. Logging in again is a single click, and a stolen cookie
// stops working the same day rather than a week later.
const SESSION_TTL_SECONDS = 60 * 60 * 12;

// SESSION_SECRET also signs the admin OAuth state token. Issuer + audience
// keep the two kinds of token from ever being accepted in each other's place.
const SESSION_ISSUER = "lawforaisafety.org";
const SESSION_AUDIENCE = "admin_session";

export type AdminSessionPayload = {
  email: string;
  name: string;
};

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing required env var: SESSION_SECRET");
  }
  return new TextEncoder().encode(secret);
}

export async function createAdminSessionCookie(
  payload: AdminSessionPayload,
): Promise<void> {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearAdminSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });
    if (typeof payload.email !== "string" || typeof payload.name !== "string") {
      return null;
    }
    // Checked on every request, not just at login — removing someone from
    // ADMIN_EMAILS ends their session on their next request.
    if (!isAdminEmailAllowed(payload.email)) return null;
    return { email: payload.email, name: payload.name };
  } catch {
    return null;
  }
}

export function isAdminEmailAllowed(email: string): boolean {
  const allowed = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

/**
 * Technical admins are the subset of admins who can do the things a reviewer
 * never needs to: erase data, switch signup on and off, read the audit log.
 * A phished reviewer account is the likeliest way into this panel, and this
 * is what keeps that from reaching the destructive or self-concealing parts.
 *
 * Must also be in ADMIN_EMAILS — this narrows access, it never grants it.
 * Empty means nobody, not everybody: an unset variable must not quietly open
 * the restricted pages to every reviewer.
 */
export function isTechAdminEmail(email: string): boolean {
  const allowed = (process.env.TECH_ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase()) && isAdminEmailAllowed(email);
}

export function isTechAdminConfigured(): boolean {
  return (process.env.TECH_ADMIN_EMAILS ?? "").trim() !== "";
}

export function pinnedAdminSubs(): string[] {
  return (process.env.ADMIN_LINKEDIN_SUBS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Second factor on the allowlist: the provider's stable account id. An email
 * address can be reassigned or re-registered; a `sub` can't. While
 * ADMIN_LINKEDIN_SUBS is unset this passes (so the ids can be collected from
 * the login log line first) — once set, both email and sub must match.
 */
export function isAdminSubAllowed(sub: string): boolean {
  const allowed = pinnedAdminSubs();
  if (allowed.length === 0) return true;
  return allowed.includes(sub);
}

export function isAdminSubPinningConfigured(): boolean {
  return pinnedAdminSubs().length > 0;
}
