import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/oauth";
import { createAdminOAuthState } from "@/lib/admin-oauth-state";
import { setOAuthStateCookie } from "@/lib/oauth-state-cookie";
import { adminWorkspaceDomain } from "@/lib/admin-workspace";

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    throw new Error("Missing required env var: NEXT_PUBLIC_SITE_URL");
  }
  const domain = adminWorkspaceDomain();

  const state = await createAdminOAuthState();
  await setOAuthStateCookie("admin", state);

  const authorizeUrl = buildAuthorizeUrl("google", {
    redirectUri: `${siteUrl}/api/admin/auth/google/callback`,
    state,
    hostedDomain: domain,
  });

  return NextResponse.redirect(authorizeUrl, 303);
}
