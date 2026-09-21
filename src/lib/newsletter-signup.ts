import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsletterSignups } from "@/drizzle/schema";
import {
  sendNewsletterConfirmationEmail,
  sendNewsletterSignupReceivedEmail,
} from "@/lib/email";
import { subscribeToBrevoList } from "@/lib/brevo-contacts";

function requireSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) throw new Error("Missing required env var: NEXT_PUBLIC_SITE_URL");
  return url;
}

export const CONFIRMATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CONFIRMATION_RESEND_MS = 24 * 60 * 60 * 1000;

/** Signups never confirmed within the link's lifetime are just a stored email address with no purpose — dropped. */
export async function sweepUnconfirmedSignups(): Promise<number> {
  const deleted = await db
    .delete(newsletterSignups)
    .where(
      and(
        isNull(newsletterSignups.confirmedAt),
        lt(newsletterSignups.createdAt, new Date(Date.now() - CONFIRMATION_TTL_MS)),
      ),
    )
    .returning({ id: newsletterSignups.id });
  return deleted.length;
}

/**
 * Standalone `/api/newsletter` signup — email isn't otherwise verified, so
 * this is a real double opt-in: a token + confirm link, not just a courtesy
 * notice. Row lands in `newsletter_signups` unconfirmed; the actual Brevo
 * subscribe happens on confirm-link click (see /api/newsletter/confirm),
 * not here.
 */
export async function recordNewsletterSignup(email: string): Promise<void> {
  await sweepUnconfirmedSignups();

  // Already sent a link (or already signed up) in the last day: nothing more
  // to send. The caller responds identically either way, so this says nothing
  // about the address — and it's what stops this endpoint being used to
  // send someone the same email from our domain over and over.
  const resendCutoff = new Date(Date.now() - CONFIRMATION_RESEND_MS);
  const [existing] = await db
    .select({ id: newsletterSignups.id })
    .from(newsletterSignups)
    .where(
      and(
        eq(newsletterSignups.email, email),
        gt(newsletterSignups.createdAt, resendCutoff),
      ),
    )
    .limit(1);
  if (existing) return;

  const confirmationToken = randomUUID();
  await db.insert(newsletterSignups).values({ email, confirmationToken });

  // A page with a button, not the API route — see /newsletter/confirm.
  const confirmUrl = `${requireSiteUrl()}/newsletter/confirm?token=${confirmationToken}`;
  await sendNewsletterConfirmationEmail(email, confirmUrl);
}

/**
 * Approval-time `newsletter_opt_in` — the email is already confirmed (OAuth
 * sign-in, or the emailed link on the email-only apply path), so a double
 * opt-in click would be redundant friction. Subscribed to Brevo
 * immediately. `newsletter_signups` is still recorded as a local audit
 * trail; `synced` reflects whether the Brevo call actually succeeded — a
 * failure here doesn't block the courtesy email or the approval itself,
 * it's logged and left for manual follow-up (no admin-facing retry UI for
 * this one, unlike the approve/reject notification-retry flow).
 */
export async function recordVerifiedNewsletterOptIn(
  email: string,
): Promise<void> {
  const [row] = await db
    .insert(newsletterSignups)
    .values({ email, confirmedAt: new Date() })
    .returning({ id: newsletterSignups.id });

  try {
    await subscribeToBrevoList(email);
    await db
      .update(newsletterSignups)
      .set({ synced: true })
      .where(eq(newsletterSignups.id, row.id));
  } catch (err) {
    console.error(`Brevo subscribe failed for newsletter signup ${row.id}:`, err);
  }

  await sendNewsletterSignupReceivedEmail(email);
}
