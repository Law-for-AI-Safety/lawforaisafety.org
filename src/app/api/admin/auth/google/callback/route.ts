import { exchangeCodeForUserInfo, UnverifiedEmailError } from "@/lib/oauth";
import { verifyAdminOAuthState } from "@/lib/admin-oauth-state";
import {
  clearOAuthStateCookie,
  oauthStateCookieMatches,
} from "@/lib/oauth-state-cookie";
import {
  adminWorkspaceDomain,
  isAdminWorkspaceAccount,
  isOnWorkspaceDomain,
  mayKeepLinkedin,
  retireLinkedin,
} from "@/lib/admin-workspace";
import {
  endSessionsOf,
  getAdminSession,
  isAdminEmailAllowed,
  startAdminSession,
} from "@/lib/session";
import { recordAdminAction } from "@/lib/audit-log";
import { rememberPerson } from "@/lib/admin-people";
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
  const domain = adminWorkspaceDomain();

  let userInfo;
  try {
    userInfo = await exchangeCodeForUserInfo("google", {
      code,
      redirectUri: `${siteUrl}/api/admin/auth/google/callback`,
    });
  } catch (err) {
    if (err instanceof UnverifiedEmailError) {
      return seeOther("/admin/login?error=forbidden");
    }
    throw err;
  }

  // Checked before the lists: an address on ADMIN_EMAILS proves nothing about who holds
  // the account unless the Workspace, with its 2-step verification and suspension, does.
  if (!isAdminWorkspaceAccount(userInfo, domain)) {
    return seeOther("/admin/login?error=workspace");
  }

  if (!isAdminEmailAllowed(userInfo.email)) {
    return seeOther("/admin/login?error=forbidden");
  }

  // The browser's current session, if it came from LinkedIn (an address off the Workspace
  // domain), is how this Workspace account is matched to the admin's LinkedIn address: both
  // are closed to LinkedIn from now on, and every LinkedIn session of theirs ends, unless
  // they are an admin who keeps LinkedIn.
  const previous = await getAdminSession();
  const linkedinEmail =
    previous && !isOnWorkspaceDomain(previous.email, domain) ? previous.email : null;
  await retireLinkedin(linkedinEmail ? [userInfo.email, linkedinEmail] : [userInfo.email], userInfo.email);
  if (linkedinEmail && !mayKeepLinkedin(linkedinEmail)) await endSessionsOf(linkedinEmail, userInfo.email);

  await startAdminSession({ email: userInfo.email, name: userInfo.name });
  // Kept so the task tracker can offer people by name; see adminPeople.
  await rememberPerson(userInfo.email, userInfo.name);
  await recordAdminAction({
    actorEmail: userInfo.email,
    action: "login",
    detail: linkedinEmail ? { provider: "google", linkedinClosedFor: linkedinEmail } : { provider: "google" },
  });

  return seeOther("/admin");
}
