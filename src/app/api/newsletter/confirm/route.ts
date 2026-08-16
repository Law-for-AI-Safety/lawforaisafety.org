import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsletterSignups } from "@/drizzle/schema";
import { subscribeToBrevoList } from "@/lib/brevo-contacts";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
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
      console.error(`Brevo subscribe failed for ${row.email}:`, err);
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
