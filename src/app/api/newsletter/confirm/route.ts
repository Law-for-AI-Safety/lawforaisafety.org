import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsletterSignups } from "@/drizzle/schema";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(
      new URL("/?newsletter=invalid#contact", request.url),
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

  return NextResponse.redirect(
    new URL(
      row ? "/?newsletter=confirmed#contact" : "/?newsletter=invalid#contact",
      request.url,
    ),
    303,
  );
}
