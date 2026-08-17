import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
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

/**
 * Standalone `/api/newsletter` signup — email isn't otherwise verified, so
 * this is a real double opt-in: a token + confirm link, not just a courtesy
 * notice. Row lands in `newsletter_signups` unconfirmed; the actual Brevo
 * subscribe happens on confirm-link click (see /api/newsletter/confirm),
 * not here.
 */
export async function recordNewsletterSignup(email: string): Promise<void> {
  const confirmationToken = randomUUID();
  await db.insert(newsletterSignups).values({ email, confirmationToken });

  const confirmUrl = `${requireSiteUrl()}/api/newsletter/confirm?token=${confirmationToken}`;
  await sendNewsletterConfirmationEmail(email, confirmUrl);
}

/**
 * Approval-time `newsletter_opt_in` — the email is already OAuth-verified,
 * so a double opt-in click would be redundant friction. Subscribed to Brevo
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
    console.error(`Brevo subscribe failed for ${email}:`, err);
  }

  await sendNewsletterSignupReceivedEmail(email);
}
