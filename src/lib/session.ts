import { randomBytes } from "node:crypto";
import { cache } from "react";
import { and, count, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { adminSessions } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { hashSessionToken } from "@/lib/session-token";

const SESSION_COOKIE_NAME = "admin_session";
// One working day. Logging in again is a single click, and a stolen cookie
// stops working the same day rather than a week later.
const SESSION_TTL_SECONDS = 60 * 60 * 12;
// How stale a session's last-seen time may get before a request refreshes it,
// so that most requests only read the row.
const SEEN_INTERVAL_MS = 5 * 60 * 1000;
// Ended and expired sessions are kept this long, then deleted at a later login.
const KEEP_DAYS = 30;

export type AdminSessionPayload = {
  email: string;
  name: string;
};

/** Starts a session for someone who has just signed in, and gives their browser its cookie. */
export async function startAdminSession(payload: AdminSessionPayload): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await db.delete(adminSessions).where(lt(adminSessions.expiresAt, new Date(now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000)));
  await db.insert(adminSessions).values({
    tokenHash: hashSessionToken(token),
    email: payload.email.toLowerCase(),
    name: payload.name,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000),
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

const live = () => and(isNull(adminSessions.endedAt), gt(adminSessions.expiresAt, new Date()));

/**
 * The signed-in admin, or null. Read from the database on each request (once per request
 * when rendering), so a session that is ended stops working on its next request.
 */
export const getAdminSession = cache(async (): Promise<AdminSessionPayload | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const [session] = await db
    .select()
    .from(adminSessions)
    .where(and(eq(adminSessions.tokenHash, hashSessionToken(token)), live()));
  if (!session) return null;
  // Checked on every request, not just at login — removing someone from
  // ADMIN_EMAILS ends their session on their next request.
  if (!isAdminEmailAllowed(session.email)) return null;
  if (Date.now() - session.lastSeenAt.getTime() > SEEN_INTERVAL_MS) {
    await db.update(adminSessions).set({ lastSeenAt: new Date() }).where(eq(adminSessions.id, session.id));
  }
  return { email: session.email, name: session.name };
});

/** Logs this browser out: its session ends, so a copy of the cookie stops working too. */
export async function endAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await db
      .update(adminSessions)
      .set({ endedAt: new Date(), endedBy: sql`${adminSessions.email}` })
      .where(and(eq(adminSessions.tokenHash, hashSessionToken(token)), isNull(adminSessions.endedAt)));
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/** Ends every live session of `email`, on every device. Returns how many were ended. */
export async function endSessionsOf(email: string, endedBy: string): Promise<number> {
  const ended = await db
    .update(adminSessions)
    .set({ endedAt: new Date(), endedBy })
    .where(and(eq(adminSessions.email, email.toLowerCase()), live()))
    .returning({ id: adminSessions.id });
  return ended.length;
}

export type SignedInAdmin = {
  email: string;
  name: string;
  sessions: number;
  lastSeenAt: Date;
};

/** Everyone with a live session, most recently active first. */
export async function listSignedInAdmins(): Promise<SignedInAdmin[]> {
  const lastSeenAt = sql<Date>`max(${adminSessions.lastSeenAt})`.mapWith(adminSessions.lastSeenAt);
  return db
    .select({
      email: adminSessions.email,
      name: sql<string>`max(${adminSessions.name})`,
      sessions: count(),
      lastSeenAt,
    })
    .from(adminSessions)
    .where(live())
    .groupBy(adminSessions.email)
    .orderBy(sql`max(${adminSessions.lastSeenAt}) desc`);
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

/**
 * Access to a team-gated set of admin pages (today: the task tracker, the opportunities
 * board). Unlike TECH_ADMIN_EMAILS, this defaults to *everyone* in ADMIN_EMAILS when `envVar`
 * is unset — the people who need these features day to day are largely the same people, and
 * requiring the env var to be set first would lock everyone out until someone remembers to
 * configure it. Setting `envVar` narrows access to that list, same "narrows, never grants"
 * rule as isTechAdminEmail.
 */
function isTeamEmail(email: string, envVar: string): boolean {
  if (!isAdminEmailAllowed(email)) return false;
  const raw = process.env[envVar] ?? "";
  if (raw.trim() === "") return true;
  const allowed = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

/** Access to the task tracker: see `isTeamEmail`. Narrowed by TASK_TRACKER_TEAM_EMAILS. */
export function isTaskTrackerTeamEmail(email: string): boolean {
  return isTeamEmail(email, "TASK_TRACKER_TEAM_EMAILS");
}

/** Access to the opportunities board's admin pages: see `isTeamEmail`. Narrowed by OPPORTUNITIES_TEAM_EMAILS. */
export function isOpportunitiesTeamEmail(email: string): boolean {
  return isTeamEmail(email, "OPPORTUNITIES_TEAM_EMAILS");
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
