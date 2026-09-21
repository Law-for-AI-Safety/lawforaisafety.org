import type { ApplicantAuthProvider } from "@/lib/applicant-types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/**
 * Slack parses `<url|label>` and `<!channel>` in webhook text, so applicant-
 * supplied values are escaped per Slack's own rules (`&`, `<`, `>` only) —
 * otherwise an applicant could post a disguised link into the reviewers'
 * channel. Capped so a long value can't push the real review link out of view.
 */
function escapeSlack(value: string, maxLength = 120): string {
  return value
    .slice(0, maxLength)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function notifyReviewersOfNewApplication({
  applicantName,
  organisation,
  authProvider,
  applicationId,
}: {
  applicantName: string;
  organisation: string | null;
  authProvider: ApplicantAuthProvider;
  applicationId: string;
}): Promise<void> {
  const webhookUrl = requireEnv("SLACK_WEBHOOK_URL");
  const siteUrl = requireEnv("NEXT_PUBLIC_SITE_URL");

  const authProviderLabel =
    authProvider === "linkedin"
      ? "LinkedIn"
      : authProvider === "google"
        ? "Google"
        : "email link";
  const orgLine = organisation ? ` (${escapeSlack(organisation)})` : "";

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // "Confirmed via", not "verified": sign-in proves control of an account
      // with this name and email, not that the person is who they claim to be.
      text: `New application: ${escapeSlack(applicantName)}${orgLine}, email confirmed via ${authProviderLabel}. Review: ${siteUrl}/admin/applications/${applicationId}`,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Slack webhook failed: ${response.status} ${await response.text()}`,
    );
  }
}

/**
 * Standard `users.list` (available on all plans, unlike the Enterprise-only
 * admin.* namespace) — used to check if an approved applicant already has a
 * workspace account before showing the manual "Invite to Slack" step.
 */
export async function isAlreadyInSlackWorkspace(
  email: string,
): Promise<boolean> {
  const botToken = requireEnv("SLACK_BOT_TOKEN");

  let cursor: string | undefined;
  do {
    const url = new URL("https://slack.com/api/users.list");
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${botToken}` },
    });
    const data = (await response.json()) as {
      ok: boolean;
      members?: { profile?: { email?: string } }[];
      response_metadata?: { next_cursor?: string };
    };

    if (!data.ok) {
      throw new Error("Slack users.list call failed");
    }

    const match = data.members?.some(
      (member) => member.profile?.email?.toLowerCase() === email.toLowerCase(),
    );
    if (match) return true;

    cursor = data.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return false;
}
