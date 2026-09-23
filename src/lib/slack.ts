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

export async function notifyReviewersOfNewRedLinesApplication({
  applicantName,
  affiliation,
  applicationId,
}: {
  applicantName: string;
  affiliation: string | null;
  applicationId: string;
}): Promise<void> {
  const webhookUrl = requireEnv("SLACK_WEBHOOK_URL");
  const siteUrl = requireEnv("NEXT_PUBLIC_SITE_URL");

  const affiliationLine = affiliation ? ` (${escapeSlack(affiliation)})` : "";

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `New Red Lines Dialogues application: ${escapeSlack(applicantName)}${affiliationLine}, confirmed via LinkedIn. Review: ${siteUrl}/admin/red-lines-dialogue/${applicationId}`,
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
 *
 * A convenience, and never throws: it runs mid-approval, after the decision
 * is saved and before the applicant is emailed, where an error would strand
 * the application. Without SLACK_BOT_TOKEN (the Slack app is optional), or
 * if Slack is unreachable, the answer is "not known to be a member" — the
 * reviewer just sees the invite button, and Slack itself says so if the
 * person turns out to be in the workspace already.
 */
export async function isAlreadyInSlackWorkspace(
  email: string,
): Promise<boolean> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) return false;

  try {
    return await findSlackMemberByEmail(botToken, email);
  } catch (err) {
    console.error("Slack membership check failed, showing the invite step anyway:", err);
    return false;
  }
}

async function findSlackMemberByEmail(
  botToken: string,
  email: string,
): Promise<boolean> {
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
