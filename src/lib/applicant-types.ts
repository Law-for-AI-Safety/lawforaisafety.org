import type { OAuthProviderName } from "@/lib/oauth";

/** "email" = no OAuth at all — applicant just typed a name + email. See applicant-flow.ts. */
export type ApplicantAuthProvider = OAuthProviderName | "email";
