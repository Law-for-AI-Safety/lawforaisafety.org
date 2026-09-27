import { looksLikeBot } from "@/lib/abuse-protection";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createRedLinesApplicationDraft, RedLinesValidationError } from "@/lib/red-lines-flow";
import { oauthHandoffResponse } from "@/lib/oauth-handoff";
import { setOAuthStateCookie } from "@/lib/oauth-state-cookie";
import { verifyTurnstile } from "@/lib/turnstile";
import { redLinesApplicationsClosedRedirect } from "@/lib/feature-flags";
import { seeOther } from "@/lib/redirect";

export async function POST(request: Request) {
  const closed = await redLinesApplicationsClosedRedirect();
  if (closed) return closed;

  const ip = getClientIp(request);
  const { allowed } = await checkRateLimit("red-lines-draft", ip, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!allowed) {
    return seeOther("/red-lines-dialogue?error=ratelimit#apply");
  }

  const formData = await request.formData();

  if (!(await verifyTurnstile(formData, ip))) {
    return seeOther("/red-lines-dialogue?error=verification#apply");
  }

  if (looksLikeBot(formData)) {
    return seeOther("/red-lines-dialogue?applied=1#apply");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    throw new Error("Missing required env var: NEXT_PUBLIC_SITE_URL");
  }
  const redirectUri = `${siteUrl}/api/red-lines-dialogue/apply/google/callback`;

  try {
    const { authorizeUrl, state } = await createRedLinesApplicationDraft(
      "google",
      formData,
      redirectUri,
    );
    await setOAuthStateCookie("redLinesApplicant", state);
    return oauthHandoffResponse(authorizeUrl, "Google");
  } catch (err) {
    if (err instanceof RedLinesValidationError) {
      return seeOther(`/red-lines-dialogue?error=${err.code}#apply`);
    }
    throw err;
  }
}
