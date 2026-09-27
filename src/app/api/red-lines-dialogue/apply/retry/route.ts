import { retryRedLinesApplicationDraft } from "@/lib/red-lines-flow";
import { redLinesApplicationsClosedRedirect } from "@/lib/feature-flags";
import { oauthHandoffResponse } from "@/lib/oauth-handoff";
import {
  oauthStateCookieMatches,
  setOAuthStateCookie,
} from "@/lib/oauth-state-cookie";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { seeOther } from "@/lib/redirect";

export async function POST(request: Request) {
  const closed = await redLinesApplicationsClosedRedirect();
  if (closed) return closed;

  const { allowed } = await checkRateLimit("red-lines-retry", getClientIp(request), {
    limit: 10,
    windowMs: 60_000,
  });
  if (!allowed) {
    return seeOther("/red-lines-dialogue?error=ratelimit#apply");
  }

  const formData = await request.formData();
  const token = formData.get("token");
  const provider = formData.get("provider");

  if (
    typeof token !== "string" ||
    (provider !== "linkedin" && provider !== "google")
  ) {
    return seeOther("/red-lines-dialogue?error=invalid#apply");
  }

  // The retry token is the draft's `state`, and this browser only holds the
  // matching cookie if it's the one that submitted the form. Without this, a
  // retry link sent to someone else would re-open the hole the cookie closes.
  if (!(await oauthStateCookieMatches("redLinesApplicant", token))) {
    return seeOther("/red-lines-dialogue?error=invalid#apply");
  }

  const retry = await retryRedLinesApplicationDraft(token, provider);
  if (!retry) {
    return seeOther("/red-lines-dialogue?error=expired#apply");
  }

  await setOAuthStateCookie("redLinesApplicant", retry.state);
  return oauthHandoffResponse(
    retry.authorizeUrl,
    provider === "google" ? "Google" : "LinkedIn",
  );
}
