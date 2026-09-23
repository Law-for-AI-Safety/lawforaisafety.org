import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { featureFlags } from "@/drizzle/schema";
import { seeOther } from "@/lib/redirect";

// One flag covers the whole public signup feature: newsletter signup and
// apply-to-work-with-us. Admin review and already-sent confirm links are not
// gated by it.
export const SIGNUP_FLAG = "signup";

// Separate flag: the Red Lines Dialogues application is its own process with
// its own timeline, independent of the volunteer signup feature above.
export const RED_LINES_FLAG = "red_lines_applications";

// Read at request time, never cached — a toggle from the admin panel takes
// effect on the next request. Fails closed: if the DB can't be read, the
// flag is treated as off (nothing could be saved in that state anyway).
async function isFlagEnabled(key: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ enabled: featureFlags.enabled })
      .from(featureFlags)
      .where(eq(featureFlags.key, key))
      .limit(1);
    return row?.enabled ?? false;
  } catch (err) {
    console.error(`Failed to read feature flag "${key}"`, err);
    return false;
  }
}

// For the admin settings page. Unlike isFlagEnabled this lets DB errors
// throw, so an admin sees a failure rather than a misleading "off".
async function getFlagState(key: string): Promise<{
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
    .where(eq(featureFlags.key, key))
    .limit(1);
  return row ?? null;
}

async function setFlagEnabled(
  key: string,
  enabled: boolean,
  updatedBy: string,
): Promise<void> {
  await db
    .insert(featureFlags)
    .values({ key, enabled, updatedBy })
    .onConflictDoUpdate({
      target: featureFlags.key,
      set: { enabled, updatedBy, updatedAt: new Date() },
    });
}

export const isSignupEnabled = () => isFlagEnabled(SIGNUP_FLAG);
export const getSignupFlagState = () => getFlagState(SIGNUP_FLAG);
export const setSignupEnabled = (enabled: boolean, updatedBy: string) =>
  setFlagEnabled(SIGNUP_FLAG, enabled, updatedBy);

export const isRedLinesApplicationsEnabled = () => isFlagEnabled(RED_LINES_FLAG);
export const getRedLinesFlagState = () => getFlagState(RED_LINES_FLAG);
export const setRedLinesApplicationsEnabled = (enabled: boolean, updatedBy: string) =>
  setFlagEnabled(RED_LINES_FLAG, enabled, updatedBy);

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

// Guard for the Red Lines Dialogues form-submit / OAuth routes.
export async function redLinesApplicationsClosedRedirect(): Promise<Response | null> {
  if (await isRedLinesApplicationsEnabled()) return null;
  return seeOther("/red-lines-dialogue?error=closed#apply");
}
