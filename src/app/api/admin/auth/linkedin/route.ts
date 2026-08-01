import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/oauth";
import { createAdminOAuthState } from "@/lib/admin-oauth-state";

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    throw new Error("Missing required env var: NEXT_PUBLIC_SITE_URL");
  }

  const state = await createAdminOAuthState();
  const authorizeUrl = buildAuthorizeUrl("linkedin", {
    redirectUri: `${siteUrl}/api/admin/auth/linkedin/callback`,
    state,
  });

  return NextResponse.redirect(authorizeUrl, 303);
}
