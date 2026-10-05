import { looksLikeBot } from "@/lib/abuse-protection";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  createApplicationDraft,
  parseSource,
  returnPathFor,
  ValidationError,
} from "@/lib/applicant-flow";
import { oauthHandoffResponse } from "@/lib/oauth-handoff";
import { setOAuthStateCookie } from "@/lib/oauth-state-cookie";
import { verifyTurnstile } from "@/lib/turnstile";
import { signupClosedRedirect } from "@/lib/feature-flags";
import { seeOther } from "@/lib/redirect";

export async function POST(request: Request) {
  const formData = await request.formData();
  const returnPath = returnPathFor(parseSource(formData));

  const closed = await signupClosedRedirect(returnPath);
  if (closed) return closed;

  const ip = getClientIp(request);
  const { allowed } = await checkRateLimit("auth-draft", ip, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!allowed) {
    // This route is reached by a browser form post, so a JSON body would be
    // shown to the visitor as a raw page. Send them back with a message instead.
    return seeOther(`${returnPath}?error=ratelimit#contact`);
  }

  if (!(await verifyTurnstile(formData, ip))) {
    return seeOther(`${returnPath}?error=verification#contact`);
  }

  if (looksLikeBot(formData)) {
    return seeOther(`${returnPath}?applied=1#contact`);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    throw new Error("Missing required env var: NEXT_PUBLIC_SITE_URL");
  }
  const redirectUri = `${siteUrl}/api/auth/google/callback`;

  try {
    const { authorizeUrl, state } = await createApplicationDraft(
      "google",
      formData,
      redirectUri,
    );
    // Ties the sign-in to this browser — the callback refuses a `state` that
    // didn't start here.
    await setOAuthStateCookie("applicant", state);
    return oauthHandoffResponse(authorizeUrl, "Google");
  } catch (err) {
    if (err instanceof ValidationError) {
      return seeOther(`${returnPath}?error=${err.code}#contact`);
    }
    throw err;
  }
}
