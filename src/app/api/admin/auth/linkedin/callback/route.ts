import { exchangeCodeForUserInfo, UnverifiedEmailError } from "@/lib/oauth";
import { verifyAdminOAuthState } from "@/lib/admin-oauth-state";
import {
  clearOAuthStateCookie,
  oauthStateCookieMatches,
} from "@/lib/oauth-state-cookie";
import {
  createAdminSessionCookie,
  isAdminEmailAllowed,
  isAdminSubAllowed,
  isAdminSubPinningConfigured,
} from "@/lib/session";
import { recordAdminAction } from "@/lib/audit-log";
import { seeOther } from "@/lib/redirect";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // Signed by us *and* issued to this browser — the signature alone would
  // accept a state token minted for someone else's login attempt.
  const stateOk =
    Boolean(state) &&
    (await verifyAdminOAuthState(state!)) &&
    (await oauthStateCookieMatches("admin", state));
  await clearOAuthStateCookie("admin");

  if (!stateOk) {
    return seeOther("/admin/login?error=invalid");
  }

  if (!code) {
    return seeOther("/admin/login?error=denied");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    throw new Error("Missing required env var: NEXT_PUBLIC_SITE_URL");
  }

  let userInfo;
  try {
    userInfo = await exchangeCodeForUserInfo("linkedin", {
      code,
      redirectUri: `${siteUrl}/api/admin/auth/linkedin/callback`,
    });
  } catch (err) {
    if (err instanceof UnverifiedEmailError) {
      return seeOther("/admin/login?error=forbidden");
    }
    throw err;
  }

  if (!isAdminEmailAllowed(userInfo.email)) {
    return seeOther("/admin/login?error=forbidden");
  }

  if (!isAdminSubAllowed(userInfo.sub)) {
    // Right email, wrong LinkedIn account. Either the env var is out of date
    // or someone has registered an account against an admin's address.
    console.warn(
      `[admin-login] Refused ${userInfo.email}: LinkedIn sub ${userInfo.sub} is not in ADMIN_LINKEDIN_SUBS`,
    );
    return seeOther("/admin/login?error=forbidden");
  }

  if (!isAdminSubPinningConfigured()) {
    // Also shown on /admin/settings → Admin logins, which is the easier place to collect it.
    console.log(
      `[admin-login] ${userInfo.email} signed in with LinkedIn sub ${userInfo.sub} (ADMIN_LINKEDIN_SUBS not set, sub not enforced)`,
    );
  }

  await createAdminSessionCookie({ email: userInfo.email, name: userInfo.name });
  // The sub is kept so a technical admin can read every admin's LinkedIn id
  // off the settings page when filling in ADMIN_LINKEDIN_SUBS. It's an opaque
  // account id, not a credential.
  await recordAdminAction({
    actorEmail: userInfo.email,
    action: "login",
    detail: { linkedinSub: userInfo.sub },
  });

  return seeOther("/admin");
}
