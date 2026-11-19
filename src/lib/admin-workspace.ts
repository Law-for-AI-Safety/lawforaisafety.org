import { eq, inArray } from "drizzle-orm";
import { adminLinkedinRetired } from "@/drizzle/schema";
import { db } from "@/lib/db";
import type { OAuthUserInfo } from "@/lib/oauth";

/**
 * The organisation's Google Workspace domain, or null while ADMIN_GOOGLE_DOMAIN is unset.
 * Kept in an env var rather than in code because the repository is public. A leading `@` or
 * a trailing dot is dropped, so a value copied from an address or a DNS record still matches.
 */
export function configuredAdminWorkspaceDomain(): string | null {
  const domain = (process.env.ADMIN_GOOGLE_DOMAIN ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/\.$/, "");
  return domain || null;
}

/**
 * The Workspace domain, the only one Google admin login accepts. Unset is a configuration
 * error, not "any domain": without it any Google account whose email is on the lists could
 * sign in, and the Workspace's 2-step verification, suspension and sign-in audit would
 * protect nothing.
 */
export function adminWorkspaceDomain(): string {
  const domain = configuredAdminWorkspaceDomain();
  if (!domain) {
    throw new Error("Missing required env var: ADMIN_GOOGLE_DOMAIN");
  }
  return domain;
}

export function isOnWorkspaceDomain(email: string, domain: string): boolean {
  return email.toLowerCase().endsWith(`@${domain}`);
}

/**
 * Whether a Google sign-in is an account of the organisation's own Workspace. Both must
 * hold: `hd` is set by Google only for accounts the Workspace manages, and the address
 * must be on that domain, so a Workspace account with an outside address can't stand in
 * for an admin. The email is already verified by the time this runs (see
 * exchangeCodeForUserInfo).
 */
export function isAdminWorkspaceAccount(user: OAuthUserInfo, domain: string): boolean {
  return user.hostedDomain?.toLowerCase() === domain && isOnWorkspaceDomain(user.email, domain);
}

/**
 * Admins who may go on signing in with LinkedIn after they have used Google, from
 * ADMIN_LINKEDIN_KEEP_EMAILS. Like the other lists it only narrows ADMIN_EMAILS: the
 * LinkedIn login checks that first.
 */
export function mayKeepLinkedin(email: string): boolean {
  return (process.env.ADMIN_LINKEDIN_KEEP_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

/**
 * Closes LinkedIn admin login for `emails`, because their owner has just signed in with the
 * Workspace account `googleEmail`. An address already closed keeps its first record.
 */
export async function retireLinkedin(emails: string[], googleEmail: string): Promise<void> {
  const unique = [...new Set(emails.map((email) => email.toLowerCase()))];
  await db
    .insert(adminLinkedinRetired)
    .values(unique.map((email) => ({ email, googleEmail: googleEmail.toLowerCase() })))
    .onConflictDoNothing();
}

/** Whether LinkedIn admin login is closed for `email`. */
export async function isLinkedinRetired(email: string): Promise<boolean> {
  const [row] = await db
    .select({ email: adminLinkedinRetired.email })
    .from(adminLinkedinRetired)
    .where(eq(adminLinkedinRetired.email, email.toLowerCase()));
  return Boolean(row);
}

/** For each of `emails` whose LinkedIn login is closed, the Workspace address it moved to. */
export async function linkedinRetirements(emails: string[]): Promise<Map<string, string>> {
  if (emails.length === 0) return new Map();
  const rows = await db
    .select()
    .from(adminLinkedinRetired)
    .where(inArray(adminLinkedinRetired.email, emails.map((email) => email.toLowerCase())));
  return new Map(rows.map((row) => [row.email, row.googleEmail]));
}

/**
 * Whether a signed-in admin should be asked to move to Google: their session is not on the
 * Workspace domain (so it came from LinkedIn), Google login is configured, and they aren't
 * one of the admins who keep LinkedIn.
 */
export function shouldOfferGoogle(sessionEmail: string): boolean {
  const domain = configuredAdminWorkspaceDomain();
  return domain !== null && !isOnWorkspaceDomain(sessionEmail, domain) && !mayKeepLinkedin(sessionEmail);
}
