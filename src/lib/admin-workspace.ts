import { eq, inArray } from "drizzle-orm";
import { adminLinkedinRetired } from "@/drizzle/schema";
import { db } from "@/lib/db";
import type { OAuthUserInfo } from "@/lib/oauth";

/** A domain as written in a setting: trimmed, lower-cased, without a leading `@` or a trailing dot. */
function domainSetting(name: string): string | null {
  const domain = (process.env[name] ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/\.$/, "");
  return domain || null;
}

/**
 * The domain admins' Workspace addresses are on, or null while ADMIN_GOOGLE_DOMAIN is unset,
 * which switches Google admin login off. Kept in an env var rather than in code because the
 * repository is public. A value copied from an address or a DNS record still matches.
 */
export function configuredAdminWorkspaceDomain(): string | null {
  return domainSetting("ADMIN_GOOGLE_DOMAIN");
}

/**
 * The Workspace's primary domain, which Google sends as `hd` for every account the Workspace
 * manages, whichever of its domains the address is on. ADMIN_GOOGLE_HOSTED_DOMAIN when the
 * addresses are on a secondary domain; otherwise the same as ADMIN_GOOGLE_DOMAIN.
 */
export function configuredAdminHostedDomain(): string | null {
  return domainSetting("ADMIN_GOOGLE_HOSTED_DOMAIN") ?? configuredAdminWorkspaceDomain();
}

export function isOnWorkspaceDomain(email: string, domain: string): boolean {
  return email.toLowerCase().endsWith(`@${domain}`);
}

/**
 * Whether a Google sign-in is an account of the organisation's own Workspace. Both must
 * hold: `hd` is set by Google only for accounts the Workspace manages (`hostedDomain`), and
 * the address must be on the admins' domain (`domain`), so a Workspace account with an outside
 * address can't stand in for an admin. The email is already verified by the time this runs
 * (see exchangeCodeForUserInfo).
 */
export function isAdminWorkspaceAccount(
  user: OAuthUserInfo,
  { domain, hostedDomain }: { domain: string; hostedDomain: string },
): boolean {
  return user.hostedDomain?.toLowerCase() === hostedDomain && isOnWorkspaceDomain(user.email, domain);
}

/** A session that came from LinkedIn: so recorded, or from before the provider was recorded. */
export function isLinkedinSession(provider: string | null): boolean {
  return provider === null || provider === "linkedin";
}

/**
 * Whether LinkedIn admin login, and every LinkedIn session, is closed for `email`: it has
 * moved to Google (`retired`, see retireLinkedin), or it is itself a Workspace address, whose
 * owner can sign in with that account. Enforced only while Google login is configured, so
 * switching Google login off (unsetting ADMIN_GOOGLE_DOMAIN) lets everyone back in through
 * LinkedIn, and never for an address on ADMIN_LINKEDIN_KEEP_EMAILS.
 */
export function isLinkedinClosedFor(email: string, retired: boolean): boolean {
  const domain = configuredAdminWorkspaceDomain();
  if (!domain || mayKeepLinkedin(email)) return false;
  return retired || isOnWorkspaceDomain(email, domain);
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
 * Whether a signed-in admin should be asked to move to Google: their session came from
 * LinkedIn, Google login is configured, and they aren't one of the admins who keep LinkedIn.
 */
export function shouldOfferGoogle(session: { email: string; provider: string | null }): boolean {
  return (
    configuredAdminWorkspaceDomain() !== null && isLinkedinSession(session.provider) && !mayKeepLinkedin(session.email)
  );
}
