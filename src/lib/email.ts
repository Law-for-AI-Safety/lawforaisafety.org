const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function send(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch(BREVO_SEND_URL, {
    method: "POST",
    headers: {
      "api-key": requireEnv("BREVO_API_KEY"),
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        email: requireEnv("BREVO_FROM_EMAIL"),
        name: process.env.BREVO_FROM_NAME || "Law for AI Safety",
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo send failed: ${res.status} ${body}`);
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
 * ourselves via Brevo's transactional API + a token; Phase 2 can hand it off
 * to Brevo's own DOI mechanism instead, see Implementation Phasing).
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
