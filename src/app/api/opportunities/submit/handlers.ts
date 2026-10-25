import { looksLikeBot } from "@/lib/abuse-protection";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  createSubmissionDraft,
  handleSubmissionOAuthCallback,
  SUBMIT_PATH,
  SubmissionValidationError,
} from "@/lib/opportunity-submission-flow";
import { authProviderLabel } from "@/lib/applicant-types";
import type { OAuthProviderName } from "@/lib/oauth";
import { oauthHandoffResponse } from "@/lib/oauth-handoff";
import {
  clearOAuthStateCookie,
  oauthStateCookieMatches,
  setOAuthStateCookie,
} from "@/lib/oauth-state-cookie";
import { verifyTurnstile } from "@/lib/turnstile";
import { seeOther } from "@/lib/redirect";

/**
 * The LinkedIn and Google routes of /opportunities/submit differ only in the provider, so each
 * route file is one line over these.
 */

export { SUBMIT_PATH };

/** Checks shared by every route that starts a submission: rate limit, Turnstile, and the bot traps. */
export async function screenSubmission(
  request: Request,
): Promise<{ formData: FormData } | { response: Response }> {
  const ip = getClientIp(request);
  const { allowed } = await checkRateLimit("opportunity-submit-draft", ip, { limit: 5, windowMs: 60_000 });
  if (!allowed) return { response: seeOther(`${SUBMIT_PATH}?error=ratelimit`) };

  const formData = await request.formData();
  if (!(await verifyTurnstile(formData, ip))) {
    return { response: seeOther(`${SUBMIT_PATH}?error=verification`) };
  }
  return { formData };
}

export function startSubmission(provider: OAuthProviderName) {
  return async function POST(request: Request): Promise<Response> {
    const screened = await screenSubmission(request);
    if ("response" in screened) return screened.response;
    // Same answer as a real submission, so a bot learns nothing from it.
    if (looksLikeBot(screened.formData)) return seeOther(`${SUBMIT_PATH}?submitted=1`);

    try {
      const { authorizeUrl, state } = await createSubmissionDraft(provider, screened.formData);
      await setOAuthStateCookie("opportunitySubmitter", state);
      return oauthHandoffResponse(authorizeUrl, authProviderLabel(provider));
    } catch (err) {
      if (err instanceof SubmissionValidationError) return seeOther(`${SUBMIT_PATH}?error=${err.code}`);
      throw err;
    }
  };
}

export function submissionCallback(provider: OAuthProviderName) {
  return async function GET(request: Request): Promise<Response> {
    const { searchParams } = new URL(request.url);
    const state = searchParams.get("state");

    const redirectTo = await handleSubmissionOAuthCallback(
      provider,
      {
        code: searchParams.get("code"),
        error: searchParams.get("error"),
        state,
        stateMatchesCookie: await oauthStateCookieMatches("opportunitySubmitter", state),
      },
    );

    // The retry page needs the cookie to prove it's the same browser.
    if (!redirectTo.startsWith(`${SUBMIT_PATH}/retry`)) await clearOAuthStateCookie("opportunitySubmitter");
    return seeOther(redirectTo);
  };
}
