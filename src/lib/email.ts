const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://lawforaisafety.org";
}

/**
 * Wraps body content in the shared branded shell (card, footer logo).
 * Inline styles only — email clients strip <style> blocks, and Outlook
 * desktop in particular doesn't reliably inherit CSS from parent elements,
 * so styling stays on each individual tag rather than a shared class.
 * SVG isn't used for the logo (Outlook desktop doesn't render it in HTML
 * email) — public/logo-email.png is a generated PNG export instead.
 */
function wrapEmailHtml(bodyHtml: string): string {
  return `
<div style="background-color:#f3f0ec;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:480px;margin:0 auto;background-color:#ffffff;border-radius:4px;overflow:hidden;">
    <div style="padding:32px 32px 24px;color:#16161d;font-size:16px;line-height:1.6;">
      ${bodyHtml}
    </div>
    <div style="padding:24px 32px;border-top:1px solid #e5e2dc;text-align:center;">
      <img src="${siteUrl()}/logo-email.png" alt="Law for AI Safety" width="160" style="display:block;margin:0 auto 8px;height:auto;border:0;" />
      <p style="margin:0;font-size:12px;color:#1b334c;opacity:0.6;">Law for AI Safety</p>
    </div>
  </div>
</div>`;
}

async function send(to: string, subject: string, bodyHtml: string): Promise<void> {
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
      htmlContent: wrapEmailHtml(bodyHtml),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo send failed: ${res.status} ${body}`);
  }
}

function approvedEmail() {
  return {
    subject: "Your application to Law for AI Safety has been approved",
    bodyHtml: `<p style="margin:0 0 16px;">Good news. Your application to work with Law for AI Safety has been approved.</p>
     <p style="margin:0;">We'll be in touch shortly with next steps.</p>`,
  };
}

function rejectedEmail() {
  return {
    subject: "Update on your Law for AI Safety application",
    bodyHtml: `<p style="margin:0 0 16px;">Thank you for your interest in working with Law for AI Safety.</p>
     <p style="margin:0 0 16px;">After review, we're not able to move forward with your application at this time.</p>
     <p style="margin:0;">We appreciate you taking the time to apply, and wish you the best.</p>`,
  };
}

/**
 * Real double opt-in — standalone `/api/newsletter` signups aren't otherwise
 * verified, so this is the actual confirmation gate (Phase 1 builds this
 * ourselves via Brevo's transactional API + a token; Phase 2 can hand it off
 * to Brevo's own DOI mechanism instead, see Implementation Phasing).
 */
function newsletterConfirmationEmail(confirmUrl: string) {
  return {
    subject: "Confirm your subscription",
    bodyHtml: `<p style="margin:0 0 16px;">Please confirm you'd like to receive the Law for AI Safety newsletter.</p>
     <p style="margin:0 0 16px;"><a href="${confirmUrl}" style="color:#9b1c1f;">Confirm your subscription</a></p>
     <p style="margin:0;">If you didn't request this, you can ignore this email.</p>`,
  };
}

/**
 * Courtesy notice only, no confirm link — used when the email is already
 * verified another way (OAuth, for the apply-flow newsletter opt-in), so a
 * separate double opt-in click would be redundant.
 */
function newsletterSignupReceivedEmail() {
  return {
    subject: "You're on the list",
    bodyHtml: `<p style="margin:0 0 16px;">Thanks for signing up to the Law for AI Safety newsletter.</p>
     <p style="margin:0;">We're still finishing setup on our mailing list, so you'll start hearing from us once it's live.</p>`,
  };
}

export async function sendApplicationApprovedEmail(to: string): Promise<void> {
  const { subject, bodyHtml } = approvedEmail();
  await send(to, subject, bodyHtml);
}

export async function sendApplicationRejectedEmail(to: string): Promise<void> {
  const { subject, bodyHtml } = rejectedEmail();
  await send(to, subject, bodyHtml);
}

export async function sendNewsletterConfirmationEmail(
  to: string,
  confirmUrl: string,
): Promise<void> {
  const { subject, bodyHtml } = newsletterConfirmationEmail(confirmUrl);
  await send(to, subject, bodyHtml);
}

export async function sendNewsletterSignupReceivedEmail(
  to: string,
): Promise<void> {
  const { subject, bodyHtml } = newsletterSignupReceivedEmail();
  await send(to, subject, bodyHtml);
}

/**
 * Rendered HTML for every transactional email template, for the admin
 * preview page — not sent anywhere. Uses a placeholder confirm link since
 * the real one only exists per-signup.
 */
export function getEmailPreviews(): { label: string; subject: string; html: string }[] {
  const templates = [
    { label: "Application approved", ...approvedEmail() },
    { label: "Application rejected", ...rejectedEmail() },
    {
      label: "Newsletter confirmation",
      ...newsletterConfirmationEmail(
        `${siteUrl()}/api/newsletter/confirm?token=preview-token`,
      ),
    },
    { label: "Newsletter signup received", ...newsletterSignupReceivedEmail() },
  ];
  return templates.map(({ label, subject, bodyHtml }) => ({
    label,
    subject,
    html: wrapEmailHtml(bodyHtml),
  }));
}
