import { NextResponse } from "next/server";
import { exchangeCodeForUserInfo } from "@/lib/oauth";
import { verifyAdminOAuthState } from "@/lib/admin-oauth-state";
import { createAdminSessionCookie, isAdminEmailAllowed } from "@/lib/session";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!state || !(await verifyAdminOAuthState(state))) {
    return NextResponse.redirect(
      new URL("/admin/login?error=invalid", request.url),
      303,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/admin/login?error=denied", request.url),
      303,
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    throw new Error("Missing required env var: NEXT_PUBLIC_SITE_URL");
  }

  const userInfo = await exchangeCodeForUserInfo("linkedin", {
    code,
    redirectUri: `${siteUrl}/api/admin/auth/linkedin/callback`,
  });

  if (!isAdminEmailAllowed(userInfo.email)) {
    return NextResponse.redirect(
      new URL("/admin/login?error=forbidden", request.url),
      303,
    );
  }

  await createAdminSessionCookie({ email: userInfo.email, name: userInfo.name });

  return NextResponse.redirect(new URL("/admin", request.url), 303);
}
