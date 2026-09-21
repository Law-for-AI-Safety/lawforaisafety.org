import { NextResponse } from "next/server";
import { retryApplicationDraft } from "@/lib/applicant-flow";
import { signupClosedRedirect } from "@/lib/feature-flags";
import {
  oauthStateCookieMatches,
  setOAuthStateCookie,
} from "@/lib/oauth-state-cookie";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const closed = await signupClosedRedirect(request);
  if (closed) return closed;

  const { allowed } = await checkRateLimit("auth-retry", getClientIp(request), {
    limit: 10,
    windowMs: 60_000,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const formData = await request.formData();
  const token = formData.get("token");
  const provider = formData.get("provider");

  if (
    typeof token !== "string" ||
    (provider !== "linkedin" && provider !== "google")
  ) {
    return NextResponse.redirect(new URL("/?error=invalid#contact", request.url), 303);
  }

  // The retry token is the draft's `state`, and this browser only holds the
  // matching cookie if it's the one that submitted the form. Without this, a
  // retry link sent to someone else would re-open the hole the cookie closes.
  if (!(await oauthStateCookieMatches("applicant", token))) {
    return NextResponse.redirect(new URL("/?error=invalid#contact", request.url), 303);
  }

  const retry = await retryApplicationDraft(token, provider);
  if (!retry) {
    return NextResponse.redirect(new URL("/?error=expired#contact", request.url), 303);
  }

  await setOAuthStateCookie("applicant", retry.state);
  return NextResponse.redirect(retry.authorizeUrl, 303);
}
