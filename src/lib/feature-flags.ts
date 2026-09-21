import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { featureFlags } from "@/drizzle/schema";
import { seeOther } from "@/lib/redirect";

// One flag covers the whole public signup feature: newsletter signup and
// apply-to-work-with-us. Admin review and already-sent confirm links are not
// gated by it.
export const SIGNUP_FLAG = "signup";

// Read at request time, never cached — a toggle from the admin panel takes
// effect on the next request. Fails closed: if the DB can't be read, signup
// is treated as off (nothing could be saved in that state anyway).
export async function isSignupEnabled(): Promise<boolean> {
  try {
    const [row] = await db
      .select({ enabled: featureFlags.enabled })
      .from(featureFlags)
      .where(eq(featureFlags.key, SIGNUP_FLAG))
      .limit(1);
    return row?.enabled ?? false;
  } catch (err) {
    console.error("Failed to read signup feature flag", err);
    return false;
  }
}

// For the admin settings page. Unlike isSignupEnabled this lets DB errors
// throw, so an admin sees a failure rather than a misleading "off".
export async function getSignupFlagState(): Promise<{
  enabled: boolean;
  updatedBy: string | null;
  updatedAt: Date;
} | null> {
  const [row] = await db
    .select({
      enabled: featureFlags.enabled,
      updatedBy: featureFlags.updatedBy,
      updatedAt: featureFlags.updatedAt,
    })
    .from(featureFlags)
    .where(eq(featureFlags.key, SIGNUP_FLAG))
    .limit(1);
  return row ?? null;
}

export async function setSignupEnabled(
  enabled: boolean,
  updatedBy: string,
): Promise<void> {
  await db
    .insert(featureFlags)
    .values({ key: SIGNUP_FLAG, enabled, updatedBy })
    .onConflictDoUpdate({
      target: featureFlags.key,
      set: { enabled, updatedBy, updatedAt: new Date() },
    });
}

// Guard for the form-submit / OAuth routes, which are hit by a browser
// navigation: send the visitor back to the contact section with a message.
export async function signupClosedRedirect(): Promise<Response | null> {
  if (await isSignupEnabled()) return null;
  return seeOther("/?error=closed#contact");
}

// Guard for the newsletter route, which is called with fetch() and expects JSON.
export async function signupClosedJson(): Promise<NextResponse | null> {
  if (await isSignupEnabled()) return null;
  return NextResponse.json({ error: "Signups are currently closed" }, { status: 503 });
}
