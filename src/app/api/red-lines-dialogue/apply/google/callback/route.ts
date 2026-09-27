import { handleRedLinesOAuthCallback } from "@/lib/red-lines-flow";
import { redLinesApplicationsClosedRedirect } from "@/lib/feature-flags";
import {
  clearOAuthStateCookie,
  oauthStateCookieMatches,
} from "@/lib/oauth-state-cookie";
import { seeOther } from "@/lib/redirect";

export async function GET(request: Request) {
  const closed = await redLinesApplicationsClosedRedirect();
  if (closed) return closed;

  const { searchParams } = new URL(request.url);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    throw new Error("Missing required env var: NEXT_PUBLIC_SITE_URL");
  }

  const state = searchParams.get("state");

  const redirectTo = await handleRedLinesOAuthCallback(
    "google",
    {
      code: searchParams.get("code"),
      error: searchParams.get("error"),
      state,
      stateMatchesCookie: await oauthStateCookieMatches("redLinesApplicant", state),
    },
    `${siteUrl}/api/red-lines-dialogue/apply/google/callback`,
  );

  if (!redirectTo.startsWith("/red-lines-dialogue/retry")) {
    await clearOAuthStateCookie("redLinesApplicant");
  }

  return seeOther(redirectTo);
}
