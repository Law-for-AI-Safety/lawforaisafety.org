import { exchangeCodeForUserInfo, UnverifiedEmailError } from "@/lib/oauth";
import { verifyAdminOAuthState } from "@/lib/admin-oauth-state";
import {
  clearOAuthStateCookie,
  oauthStateCookieMatches,
} from "@/lib/oauth-state-cookie";
import {
  configuredAdminHostedDomain,
  configuredAdminWorkspaceDomain,
  isAdminWorkspaceAccount,
  isLinkedinSession,
  mayKeepLinkedin,
  retireLinkedin,
} from "@/lib/admin-workspace";
import {
  currentSessionTokenHash,
  endAdminSession,
  endLinkedinSessionsOf,
  endSessionsOf,
  getAdminSessionDetails,
  isAdminEmailAllowed,
  startAdminSession,
} from "@/lib/session";
import { areasLostBySwitch, switchAdmin, takeSwitchFor } from "@/lib/admin-switch";
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
  const switching = await takeSwitchFor(await currentSessionTokenHash());

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
  const domain = configuredAdminWorkspaceDomain();
  const hostedDomain = configuredAdminHostedDomain();
  if (!domain || !hostedDomain) return seeOther("/admin/login?error=unavailable");

  // A login started from "Switch to Google" by the LinkedIn session this browser still holds
  // is how this Workspace account is matched to the admin's LinkedIn address; see
  // admin-switch.ts. Any other Google login closes LinkedIn for the Workspace address only.
  const previous = await getAdminSessionDetails();
  const switchingFrom = switching && previous && isLinkedinSession(previous.provider) ? previous.email : null;
  // A switch that can't go ahead returns to the admin area, still signed in with LinkedIn,
  // saying why; see SwitchProblem.
  const refuse = (loginError: string, switchProblem: string) =>
    seeOther(switchingFrom ? `/admin?switch=${switchProblem}` : `/admin/login?error=${loginError}`);

  let userInfo;
  try {
    userInfo = await exchangeCodeForUserInfo("google", {
      code,
      redirectUri: `${siteUrl}/api/admin/auth/google/callback`,
    });
  } catch (err) {
    if (err instanceof UnverifiedEmailError) {
      return refuse("forbidden", "workspace");
    }
    throw err;
  }

  // Checked before the lists: an address on ADMIN_EMAILS proves nothing about who holds
  // the account unless the Workspace, with its 2-step verification and suspension, does.
  if (!isAdminWorkspaceAccount(userInfo, { domain, hostedDomain })) {
    return refuse("workspace", "workspace");
  }

  if (!isAdminEmailAllowed(userInfo.email)) {
    return refuse("forbidden", "not_listed");
  }

  if (switchingFrom) {
    const lost = areasLostBySwitch(switchingFrom, userInfo.email);
    if (lost.length > 0) return seeOther(`/admin?switch=less_access&lost=${lost.join(",")}`);
    const keepsLinkedin = mayKeepLinkedin(switchingFrom);
    await switchAdmin(switchingFrom, userInfo.email, { keepsLinkedin });
    if (!keepsLinkedin) await endSessionsOf(switchingFrom, userInfo.email);
  } else {
    await retireLinkedin([userInfo.email], userInfo.email);
    await recordAdminAction({ actorEmail: userInfo.email, action: "login", detail: { provider: "google" } });
  }
  // A LinkedIn account reporting this Workspace address is closed too, so its sessions end.
  if (!mayKeepLinkedin(userInfo.email)) await endLinkedinSessionsOf(userInfo.email, userInfo.email);
  // This browser's earlier session is replaced, so it ends rather than lingering as live.
  if (previous) await endAdminSession();

  await startAdminSession({ email: userInfo.email, name: userInfo.name, provider: "google" });
  // Kept so the task tracker can offer people by name; see adminPeople.
  await rememberPerson(userInfo.email, userInfo.name);

  return seeOther("/admin");
}
