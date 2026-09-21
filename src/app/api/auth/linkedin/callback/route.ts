import { handleOAuthCallback } from "@/lib/applicant-flow";
import { signupClosedRedirect } from "@/lib/feature-flags";
import {
  clearOAuthStateCookie,
  oauthStateCookieMatches,
} from "@/lib/oauth-state-cookie";
import { seeOther } from "@/lib/redirect";

export async function GET(request: Request) {
  const closed = await signupClosedRedirect();
  if (closed) return closed;

  const { searchParams } = new URL(request.url);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    throw new Error("Missing required env var: NEXT_PUBLIC_SITE_URL");
  }

  const state = searchParams.get("state");

  const redirectTo = await handleOAuthCallback(
    "linkedin",
    {
      code: searchParams.get("code"),
      error: searchParams.get("error"),
      state,
      stateMatchesCookie: await oauthStateCookieMatches("applicant", state),
    },
    `${siteUrl}/api/auth/linkedin/callback`,
  );

  // The retry page needs the cookie to prove it's still the same browser;
  // every other outcome is the end of this flow.
  if (!redirectTo.startsWith("/apply/retry")) {
    await clearOAuthStateCookie("applicant");
  }

  return seeOther(redirectTo);
}
