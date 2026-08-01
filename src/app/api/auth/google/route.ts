import { NextResponse } from "next/server";
import { looksLikeBot } from "@/lib/abuse-protection";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createApplicationDraft, ValidationError } from "@/lib/applicant-flow";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(`auth-draft:${ip}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const formData = await request.formData();

  if (looksLikeBot(formData)) {
    return NextResponse.redirect(new URL("/?applied=1#contact", request.url), 303);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    throw new Error("Missing required env var: NEXT_PUBLIC_SITE_URL");
  }
  const redirectUri = `${siteUrl}/api/auth/google/callback`;

  try {
    const authorizeUrl = await createApplicationDraft(
      "google",
      formData,
      redirectUri,
    );
    return NextResponse.redirect(authorizeUrl, 303);
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.redirect(
        new URL("/?error=validation#contact", request.url),
        303,
      );
    }
    throw err;
  }
}
