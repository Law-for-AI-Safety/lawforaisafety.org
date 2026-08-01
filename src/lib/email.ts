import { Resend } from "resend";

let client: Resend | null = null;

function getClient(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("Missing required env var: RESEND_API_KEY");
    }
    client = new Resend(apiKey);
  }
  return client;
}

function getFromAddress(): string {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    throw new Error("Missing required env var: RESEND_FROM_EMAIL");
  }
  return from;
}

async function send(to: string, subject: string, html: string): Promise<void> {
  const { error } = await getClient().emails.send({
    from: getFromAddress(),
    to,
    subject,
    html,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}

export async function sendApplicationApprovedEmail(to: string): Promise<void> {
  await send(
    to,
    "Your application to Law for AI Safety has been approved",
    `<p>Good news. Your application to work with Law for AI Safety has been approved.</p>
     <p>We'll be in touch shortly with next steps.</p>`,
  );
}

export async function sendApplicationRejectedEmail(to: string): Promise<void> {
  await send(
    to,
    "Update on your Law for AI Safety application",
    `<p>Thank you for your interest in working with Law for AI Safety.</p>
     <p>After review, we're not able to move forward with your application at this time.</p>
     <p>We appreciate you taking the time to apply, and wish you the best.</p>`,
  );
}

/**
 * Real double opt-in — standalone `/api/newsletter` signups aren't otherwise
 * verified, so this is the actual confirmation gate (Phase 1 builds this
 * ourselves via Resend + a token; Phase 2 can hand it off to the mailout
 * provider's own DOI mechanism instead, see Implementation Phasing).
 */
export async function sendNewsletterConfirmationEmail(
  to: string,
  confirmUrl: string,
): Promise<void> {
  await send(
    to,
    "Confirm your subscription",
    `<p>Please confirm you'd like to receive the Law for AI Safety newsletter.</p>
     <p><a href="${confirmUrl}">Confirm your subscription</a></p>
     <p>If you didn't request this, you can ignore this email.</p>`,
  );
}

/**
 * Courtesy notice only, no confirm link — used when the email is already
 * verified another way (OAuth, for the apply-flow newsletter opt-in), so a
 * separate double opt-in click would be redundant.
 */
export async function sendNewsletterSignupReceivedEmail(
  to: string,
): Promise<void> {
  await send(
    to,
    "You're on the list",
    `<p>Thanks for signing up to the Law for AI Safety newsletter.</p>
     <p>We're still finishing setup on our mailing list, so you'll start hearing from us once it's live.</p>`,
  );
}
