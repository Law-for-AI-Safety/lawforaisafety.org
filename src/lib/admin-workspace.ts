import type { OAuthUserInfo } from "@/lib/oauth";

/**
 * The organisation's Google Workspace domain, the only one admin login accepts. Kept in
 * ADMIN_GOOGLE_DOMAIN rather than in code because the repository is public.
 *
 * Unset is a configuration error, not "any domain": without it any Google account whose
 * email is on the lists could sign in, and the Workspace's 2-step verification, suspension
 * and sign-in audit would protect nothing.
 */
export function adminWorkspaceDomain(): string {
  const domain = (process.env.ADMIN_GOOGLE_DOMAIN ?? "").trim().toLowerCase();
  if (!domain) {
    throw new Error("Missing required env var: ADMIN_GOOGLE_DOMAIN");
  }
  return domain;
}

/**
 * Whether a Google sign-in is an account of the organisation's own Workspace. Both must
 * hold: `hd` is set by Google only for accounts the Workspace manages, and the address
 * must be on that domain, so a Workspace account with an outside address can't stand in
 * for an admin. The email is already verified by the time this runs (see
 * exchangeCodeForUserInfo).
 */
export function isAdminWorkspaceAccount(user: OAuthUserInfo, domain: string): boolean {
  return (
    user.hostedDomain?.toLowerCase() === domain &&
    user.email.toLowerCase().endsWith(`@${domain}`)
  );
}
