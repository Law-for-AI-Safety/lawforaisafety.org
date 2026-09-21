import { NextResponse } from "next/server";
import { confirmManualApplication } from "@/lib/applicant-flow";
import { signupClosedRedirect } from "@/lib/feature-flags";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Second half of the email-only apply path: the applicant has opened the
 * emailed link and pressed the button on /apply/confirm. POST only — mail
 * security scanners follow links in messages, and a GET that confirmed would
 * let a scanner submit the application on the applicant's behalf.
 */
export async function POST(request: Request) {
  const closed = await signupClosedRedirect(request);
  if (closed) return closed;

  const { allowed } = await checkRateLimit("auth-confirm", getClientIp(request), {
    limit: 10,
    windowMs: 60_000,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const formData = await request.formData();
  const token = formData.get("token");
  if (typeof token !== "string" || token === "") {
    return NextResponse.redirect(new URL("/?error=invalid#contact", request.url), 303);
  }

  const redirectTo = await confirmManualApplication(token);
  return NextResponse.redirect(new URL(redirectTo, request.url), 303);
}
