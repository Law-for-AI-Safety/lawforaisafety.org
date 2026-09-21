import { NextResponse } from "next/server";
import { looksLikeBot } from "@/lib/abuse-protection";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { submitManualApplication, ValidationError } from "@/lib/applicant-flow";
import { verifyTurnstile } from "@/lib/turnstile";
import { signupClosedRedirect } from "@/lib/feature-flags";

export async function POST(request: Request) {
  const closed = await signupClosedRedirect(request);
  if (closed) return closed;

  const ip = getClientIp(request);
  const { allowed } = await checkRateLimit("auth-draft", ip, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const formData = await request.formData();

  if (!(await verifyTurnstile(formData, ip))) {
    return NextResponse.redirect(
      new URL("/?error=verification#contact", request.url),
      303,
    );
  }

  if (looksLikeBot(formData)) {
    return NextResponse.redirect(new URL("/?applied=1#contact", request.url), 303);
  }

  try {
    const redirectTo = await submitManualApplication(formData);
    return NextResponse.redirect(new URL(redirectTo, request.url), 303);
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.redirect(
        new URL(`/?error=${err.code}#contact`, request.url),
        303,
      );
    }
    throw err;
  }
}
