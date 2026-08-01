import { NextResponse } from "next/server";
import { looksLikeBot } from "@/lib/abuse-protection";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { submitManualApplication, ValidationError } from "@/lib/applicant-flow";

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
    return NextResponse.redirect(new URL("/apply/success", request.url), 303);
  }

  try {
    const redirectTo = await submitManualApplication(formData);
    return NextResponse.redirect(new URL(redirectTo, request.url), 303);
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
