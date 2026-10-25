import { authProviderLabel } from "@/lib/applicant-types";
import { retrySubmissionDraft } from "@/lib/opportunity-submission-flow";
import { oauthHandoffResponse } from "@/lib/oauth-handoff";
import { oauthStateCookieMatches, setOAuthStateCookie } from "@/lib/oauth-state-cookie";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { seeOther } from "@/lib/redirect";
import { SUBMIT_PATH } from "../handlers";

export async function POST(request: Request) {
  const { allowed } = await checkRateLimit("opportunity-submit-retry", getClientIp(request), {
    limit: 10,
    windowMs: 60_000,
  });
  if (!allowed) return seeOther(`${SUBMIT_PATH}?error=ratelimit`);

  const formData = await request.formData();
  const token = formData.get("token");
  const provider = formData.get("provider");
  if (typeof token !== "string" || (provider !== "linkedin" && provider !== "google")) {
    return seeOther(`${SUBMIT_PATH}?error=invalid`);
  }

  // The retry token is the draft's `state`, and only the browser that submitted the form holds
  // the matching cookie, so a retry link sent to someone else gets nowhere.
  if (!(await oauthStateCookieMatches("opportunitySubmitter", token))) {
    return seeOther(`${SUBMIT_PATH}?error=invalid`);
  }

  const retry = await retrySubmissionDraft(token, provider);
  if (!retry) return seeOther(`${SUBMIT_PATH}?error=expired`);

  await setOAuthStateCookie("opportunitySubmitter", retry.state);
  return oauthHandoffResponse(retry.authorizeUrl, authProviderLabel(provider));
}
