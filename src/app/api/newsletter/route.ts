import { NextResponse } from "next/server";
import { looksLikeBot } from "@/lib/abuse-protection";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { recordNewsletterSignup } from "@/lib/newsletter-signup";

// Same success response whether the honeypot caught a bot or not — a bot
// doesn't need to be told it was caught.
const SUCCESS_RESPONSE = { ok: true };

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(`newsletter:${ip}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const formData = await request.formData();

  if (looksLikeBot(formData)) {
    return NextResponse.json(SUCCESS_RESPONSE);
  }

  const email = formData.get("email");
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  await recordNewsletterSignup(email.trim().toLowerCase());

  return NextResponse.json(SUCCESS_RESPONSE);
}
