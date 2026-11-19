import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/oauth";
import { createAdminOAuthState } from "@/lib/admin-oauth-state";
import { setOAuthStateCookie } from "@/lib/oauth-state-cookie";
import { adminWorkspaceDomain } from "@/lib/admin-workspace";
import { setSwitchFrom } from "@/lib/admin-switch-cookie";
import { getAdminSession } from "@/lib/session";

export async function GET(request: Request) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    throw new Error("Missing required env var: NEXT_PUBLIC_SITE_URL");
  }
  const domain = adminWorkspaceDomain();

  const state = await createAdminOAuthState();
  await setOAuthStateCookie("admin", state);
  // `?switch=1` comes from the "Switch to Google" banner, shown only to a LinkedIn session.
  const switching = new URL(request.url).searchParams.get("switch") === "1";
  await setSwitchFrom(switching ? ((await getAdminSession())?.email ?? null) : null);

  const authorizeUrl = buildAuthorizeUrl("google", {
    redirectUri: `${siteUrl}/api/admin/auth/google/callback`,
    state,
    hostedDomain: domain,
  });

  return NextResponse.redirect(authorizeUrl, 303);
}
