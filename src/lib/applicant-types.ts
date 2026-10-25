import type { OAuthProviderName } from "@/lib/oauth";

/** "email" = no OAuth at all — applicant just typed a name + email. See applicant-flow.ts. */
export type ApplicantAuthProvider = OAuthProviderName | "email";

/** How a sign-in method is named in emails, Slack messages and sign-in hand-off pages. */
export function authProviderLabel(provider: OAuthProviderName): "LinkedIn" | "Google";
export function authProviderLabel(provider: ApplicantAuthProvider): string;
export function authProviderLabel(provider: ApplicantAuthProvider): string {
  if (provider === "linkedin") return "LinkedIn";
  if (provider === "google") return "Google";
  return "email link";
}
