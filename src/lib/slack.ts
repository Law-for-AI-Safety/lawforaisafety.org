function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/**
 * The reviewers' channel is told only that something new is waiting, with a link to it in the
 * admin. Applicants' and submitters' details stay in our own database and admin pages, so Slack
 * never holds them.
 */
async function postToReviewers(text: string): Promise<void> {
  const response = await fetch(requireEnv("SLACK_WEBHOOK_URL"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    throw new Error(`Slack webhook failed: ${response.status} ${await response.text()}`);
  }
}

/**
 * Slack parses `<url|label>` and `<!channel>` in webhook text, so submitter-
 * supplied values are escaped per Slack's own rules (`&`, `<`, `>` only) —
 * otherwise a submitter could post a disguised link into the reviewers'
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
  applicationId,
}: {
  applicationId: string;
}): Promise<void> {
  const siteUrl = requireEnv("NEXT_PUBLIC_SITE_URL");
  await postToReviewers(`New application to review: ${siteUrl}/admin/applications/${applicationId}`);
}

export async function notifyReviewersOfNewRedLinesApplication({
  applicationId,
}: {
  applicationId: string;
}): Promise<void> {
  const siteUrl = requireEnv("NEXT_PUBLIC_SITE_URL");
  await postToReviewers(`New Red Lines Dialogues application to review: ${siteUrl}/admin/red-lines-dialogue/${applicationId}`);
}

/** `what` names the opportunity (its title and organisation, or its link), never the submitter. */
export async function notifyReviewersOfNewOpportunitySubmission({
  what,
  submissionId,
}: {
  what: string;
  submissionId: string;
}): Promise<void> {
  const siteUrl = requireEnv("NEXT_PUBLIC_SITE_URL");
  await postToReviewers(
    `New opportunity to review: ${escapeSlack(what)}. Review: ${siteUrl}/admin/opportunities/submissions/${submissionId}`,
  );
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
