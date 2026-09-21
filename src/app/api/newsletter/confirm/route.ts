import { NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsletterSignups } from "@/drizzle/schema";
import { subscribeToBrevoList } from "@/lib/brevo-contacts";
import { CONFIRMATION_TTL_MS } from "@/lib/newsletter-signup";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Links in emails sent before the confirm step moved to a page still point
 * here. Hand them on to that page rather than confirming on a GET — mail
 * security scanners follow links, and a click by a scanner isn't consent.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const target = new URL("/newsletter/confirm", request.url);
  if (token) target.searchParams.set("token", token);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: Request) {
  const { allowed } = await checkRateLimit("newsletter-confirm", getClientIp(request), {
    limit: 10,
    windowMs: 60_000,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const formData = await request.formData();
  const token = formData.get("token");

  if (typeof token !== "string" || token === "") {
    return NextResponse.redirect(
      new URL("/newsletter/invalid", request.url),
      303,
    );
  }

  const [row] = await db
    .update(newsletterSignups)
    .set({ confirmedAt: new Date(), confirmationToken: null })
    .where(
      and(
        eq(newsletterSignups.confirmationToken, token),
        isNull(newsletterSignups.confirmedAt),
        gt(newsletterSignups.createdAt, new Date(Date.now() - CONFIRMATION_TTL_MS)),
      ),
    )
    .returning();

  if (row) {
    try {
      await subscribeToBrevoList(row.email);
      await db
        .update(newsletterSignups)
        .set({ synced: true })
        .where(eq(newsletterSignups.id, row.id));
    } catch (err) {
      console.error(`Brevo subscribe failed for newsletter signup ${row.id}:`, err);
    }
  }

  return NextResponse.redirect(
    new URL(
      row ? "/newsletter/confirmed" : "/newsletter/invalid",
      request.url,
    ),
    303,
  );
}
