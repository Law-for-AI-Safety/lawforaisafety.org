import { retryApplicationDraft } from "@/lib/applicant-flow";
import { signupClosedRedirect } from "@/lib/feature-flags";
import { oauthHandoffResponse } from "@/lib/oauth-handoff";
import {
  oauthStateCookieMatches,
  setOAuthStateCookie,
} from "@/lib/oauth-state-cookie";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { seeOther } from "@/lib/redirect";

export async function POST(request: Request) {
  const closed = await signupClosedRedirect();
  if (closed) return closed;

  const { allowed } = await checkRateLimit("auth-retry", getClientIp(request), {
    limit: 10,
    windowMs: 60_000,
  });
  if (!allowed) {
    // This route is reached by a browser form post, so a JSON body would be
    // shown to the visitor as a raw page. Send them back with a message instead.
    return seeOther("/?error=ratelimit#contact");
  }

  const formData = await request.formData();
  const token = formData.get("token");
  const provider = formData.get("provider");

  if (
    typeof token !== "string" ||
    (provider !== "linkedin" && provider !== "google")
  ) {
    return seeOther("/?error=invalid#contact");
  }

  // The retry token is the draft's `state`, and this browser only holds the
  // matching cookie if it's the one that submitted the form. Without this, a
  // retry link sent to someone else would re-open the hole the cookie closes.
  if (!(await oauthStateCookieMatches("applicant", token))) {
    return seeOther("/?error=invalid#contact");
  }

  const retry = await retryApplicationDraft(token, provider);
  if (!retry) {
    return seeOther("/?error=expired#contact");
  }

  await setOAuthStateCookie("applicant", retry.state);
  return oauthHandoffResponse(
    retry.authorizeUrl,
    provider === "google" ? "Google" : "LinkedIn",
  );
}
