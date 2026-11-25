import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/oauth";
import { createAdminOAuthState } from "@/lib/admin-oauth-state";
import { setOAuthStateCookie } from "@/lib/oauth-state-cookie";
import { configuredAdminWorkspaceDomain } from "@/lib/admin-workspace";
import { setSwitchFrom } from "@/lib/admin-switch";
import { isSameOrigin } from "@/lib/admin-guard";
import { currentSessionTokenHash, getAdminSession } from "@/lib/session";
import { seeOther } from "@/lib/redirect";

/** Starts a Google login, and sends the browser to Google's account chooser. */
async function startGoogleLogin({ switching }: { switching: boolean }): Promise<Response> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    throw new Error("Missing required env var: NEXT_PUBLIC_SITE_URL");
  }
  // Until ADMIN_GOOGLE_DOMAIN is set, Google login is switched off rather than broken; the
  // login page hides its button, so only a stale link or bookmark reaches this.
  const domain = configuredAdminWorkspaceDomain();
  if (!domain) return seeOther("/admin/login?error=unavailable");

  const state = await createAdminOAuthState();
  await setOAuthStateCookie("admin", state);
  await setSwitchFrom(switching ? await currentSessionTokenHash() : null);

  const authorizeUrl = buildAuthorizeUrl("google", {
    redirectUri: `${siteUrl}/api/admin/auth/google/callback`,
    state,
    hostedDomain: domain,
    // On a switch, the admin picks their Workspace account explicitly, rather than the
    // browser silently using whichever Google account is signed in to it.
    selectAccount: switching,
  });
  return NextResponse.redirect(authorizeUrl, 303);
}

/** "Log in with Google" on the login page. */
export async function GET() {
  return startGoogleLogin({ switching: false });
}

/**
 * "Switch to Google" in the admin area, for an admin signed in with LinkedIn. A POST from
 * this site only: it decides whose LinkedIn login the Google sign-in will close, so another
 * site mustn't be able to start it.
 */
export async function POST(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!isSameOrigin(request) || (fetchSite !== null && fetchSite !== "same-origin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await getAdminSession())) return seeOther("/admin/login");
  return startGoogleLogin({ switching: true });
}
