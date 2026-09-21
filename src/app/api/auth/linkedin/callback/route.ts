import { NextResponse } from "next/server";
import { handleOAuthCallback } from "@/lib/applicant-flow";
import { signupClosedRedirect } from "@/lib/feature-flags";

export async function GET(request: Request) {
  const closed = await signupClosedRedirect(request);
  if (closed) return closed;

  const { searchParams } = new URL(request.url);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    throw new Error("Missing required env var: NEXT_PUBLIC_SITE_URL");
  }

  const redirectTo = await handleOAuthCallback(
    "linkedin",
    {
      code: searchParams.get("code"),
      error: searchParams.get("error"),
      state: searchParams.get("state"),
    },
    `${siteUrl}/api/auth/linkedin/callback`,
  );

  return NextResponse.redirect(new URL(redirectTo, request.url), 303);
}
