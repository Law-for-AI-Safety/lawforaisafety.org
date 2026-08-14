import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { newsletterSignups } from "@/drizzle/schema";
import {
  sendNewsletterConfirmationEmail,
  sendNewsletterSignupReceivedEmail,
} from "@/lib/email";

function requireSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) throw new Error("Missing required env var: NEXT_PUBLIC_SITE_URL");
  return url;
}

/**
 * Standalone `/api/newsletter` signup — email isn't otherwise verified, so
 * this is a real double opt-in: a token + confirm link, not just a courtesy
 * notice. Row lands in `newsletter_signups` unconfirmed until the link is
 * clicked; Phase 2 backfill only imports confirmed rows (see Implementation
 * Phasing in the feature spec).
 */
export async function recordNewsletterSignup(email: string): Promise<void> {
  const confirmationToken = randomUUID();
  await db.insert(newsletterSignups).values({ email, confirmationToken });

  const confirmUrl = `${requireSiteUrl()}/api/newsletter/confirm?token=${confirmationToken}`;
  await sendNewsletterConfirmationEmail(email, confirmUrl);
}

/**
 * Approval-time `newsletter_opt_in` — the email is already OAuth-verified,
 * so a double opt-in click would be redundant friction (same reasoning the
 * spec applies to the real Brevo mailout call in Phase 2). Confirmed
 * immediately; just a courtesy notice email, no link.
 */
export async function recordVerifiedNewsletterOptIn(
  email: string,
): Promise<void> {
  await db
    .insert(newsletterSignups)
    .values({ email, confirmedAt: new Date() });
  await sendNewsletterSignupReceivedEmail(email);
}
