"use server";

import { z } from "zod";
import { recordAdminAction } from "@/lib/audit-log";
import {
  BrevoError,
  createCampaign,
  deleteCampaign,
  getCampaign,
  getNewsletterList,
  scheduleCampaign,
  sendCampaignNow,
  suspendCampaign,
  updateCampaign,
} from "@/lib/brevo-campaigns";
import { isProductionDeploy } from "@/lib/deploy-context";
import { sendNewsletterTestEmail } from "@/lib/email";
import { requireNewsletter } from "@/lib/newsletter-access";
import {
  claimForSubmit,
  getNewsletter,
  insertNewsletter,
  markSubmitted,
  markTested,
  releaseClaim,
  removeNewsletter,
  returnToDraft,
  setCampaignId,
  setScheduledAt,
  writeNewsletter,
  type NewsletterRow,
} from "@/lib/newsletter-store";
import {
  BREVO_UNSUBSCRIBE_TAG,
  BODY_MAX,
  newsletterProblems,
  renderNewsletterHtml,
  type FieldProblems,
  type NewsletterFields,
} from "@/newsletter/template";
import { scheduleProblem, STUCK_AFTER_MS } from "@/newsletter/schedule";
import { siteUrl, TEST_UNSUBSCRIBE_HREF } from "@/newsletter/site";

/**
 * The newsletter's server actions. Each is a public endpoint: it checks the caller's permission
 * itself (read from the database on every call) and validates every argument, whatever the UI
 * shows. Sending to the list also needs the production deploy, a test of the exact version
 * being sent, and the list's current subscriber count typed back.
 */

export type Refusal = {
  ok: false;
  reason:
    | "signed_out"
    | "invalid"
    | "not_found"
    | "conflict"
    | "locked"
    | "not_ready"
    | "not_production"
    | "count_mismatch"
    | "brevo";
  message: string;
};

const INVALID: Refusal = { ok: false, reason: "invalid", message: "The request was not understood." };
const NOT_FOUND: Refusal = { ok: false, reason: "not_found", message: "There is no such newsletter." };
const CONFLICT: Refusal = {
  ok: false,
  reason: "conflict",
  message: "Someone else changed this newsletter since you opened it. Reload the page to see their changes.",
};
const LOCKED: Refusal = {
  ok: false,
  reason: "locked",
  message: "This newsletter has been handed to Brevo, so it can't be changed. Cancel it first to edit it.",
};
const NOT_PRODUCTION: Refusal = {
  ok: false,
  reason: "not_production",
  message: "Sending to the list only works on the live site. Here you can write, preview and test-send.",
};

const idArg = z.uuid();
const versionArg = z.number().int().min(1).max(2_147_483_647);
const fieldsArg = z.object({
  subject: z.string().max(1000),
  previewText: z.string().max(1000),
  body: z.string().max(BODY_MAX * 2),
});
const whenArg = z.iso.datetime({ offset: true });
const countArg = z.number().int().min(0);

function brevoFailure(err: unknown, doing: string): Refusal {
  console.error(`[newsletter] Brevo failed while ${doing}`, err);
  const detail = err instanceof BrevoError ? ` Brevo said: ${err.status} ${err.body.slice(0, 300)}` : "";
  return { ok: false, reason: "brevo", message: `Brevo could not ${doing}. Nothing was sent.${detail}` };
}

const fieldsOf = (row: NewsletterRow): NewsletterFields => ({
  subject: row.subject,
  previewText: row.previewText,
  body: row.body,
});

export async function createNewsletter(): Promise<{ ok: true; id: string } | Refusal> {
  const actor = await requireNewsletter();
  if (!actor.ok) return actor;
  return { ok: true, id: await insertNewsletter(actor.email) };
}

export type SaveResult = { ok: true; version: number; problems: FieldProblems } | Refusal;

/** Saves the draft, if it is still at `version`. Unfinished drafts save too, with what they still need. */
export async function saveNewsletter(id: unknown, fields: unknown, version: unknown): Promise<SaveResult> {
  const actor = await requireNewsletter();
  if (!actor.ok) return actor;
  const args = z.tuple([idArg, fieldsArg, versionArg]).safeParse([id, fields, version]);
  if (!args.success) return INVALID;
  const [newsletterId, values, from] = args.data;

  const saved = await writeNewsletter(newsletterId, values, from, actor.email);
  if (saved === null) return refusalFor(await getNewsletter(newsletterId), from);
  return { ok: true, version: saved, problems: newsletterProblems(values) };
}

/** Why a write to a newsletter at `version` did not happen. */
function refusalFor(row: NewsletterRow | null, version: number): Refusal {
  if (!row) return NOT_FOUND;
  if (row.state !== "draft") return LOCKED;
  return row.version === version ? INVALID : CONFLICT;
}

export async function deleteNewsletter(id: unknown, version: unknown): Promise<{ ok: true } | Refusal> {
  const actor = await requireNewsletter();
  if (!actor.ok) return actor;
  const args = z.tuple([idArg, versionArg]).safeParse([id, version]);
  if (!args.success) return INVALID;
  const [newsletterId, at] = args.data;

  const removed = await removeNewsletter(newsletterId, at);
  if (!removed) return refusalFor(await getNewsletter(newsletterId), at);
  // A campaign left from a failed hand-over was never scheduled, so Brevo lets it go.
  if (removed.brevoCampaignId !== null) {
    await deleteCampaign(removed.brevoCampaignId).catch((err) =>
      console.error(`[newsletter] Could not delete Brevo campaign ${removed.brevoCampaignId}`, err),
    );
  }
  return { ok: true };
}

/** Loads a draft that is at `version` and ready to send, or why not. */
async function readyDraft(id: string, version: number): Promise<{ ok: true; row: NewsletterRow } | Refusal> {
  const row = await getNewsletter(id);
  if (!row) return NOT_FOUND;
  if (row.state !== "draft") return LOCKED;
  if (row.version !== version) return CONFLICT;
  const problems = Object.values(newsletterProblems(fieldsOf(row)));
  if (problems.length > 0) return { ok: false, reason: "not_ready", message: problems.join(" ") };
  return { ok: true, row };
}

/** Sends the saved draft at `version` to the signed-in admin, marked as a test. */
export async function sendTestNewsletter(id: unknown, version: unknown): Promise<{ ok: true; to: string } | Refusal> {
  const actor = await requireNewsletter();
  if (!actor.ok) return actor;
  const args = z.tuple([idArg, versionArg]).safeParse([id, version]);
  if (!args.success) return INVALID;
  const [newsletterId, at] = args.data;

  const ready = await readyDraft(newsletterId, at);
  if (!ready.ok) return ready;
  const fields = fieldsOf(ready.row);
  const html = renderNewsletterHtml(fields, { siteUrl: siteUrl(), unsubscribeHref: TEST_UNSUBSCRIBE_HREF });
  try {
    await sendNewsletterTestEmail(actor.email, fields.subject.trim(), html);
  } catch (err) {
    console.error("[newsletter] Test send failed", err);
    return { ok: false, reason: "brevo", message: "The test email could not be sent. Try again in a minute." };
  }
  // A save in between leaves the new version untested, which is right.
  await markTested(newsletterId, at);
  return { ok: true, to: actor.email };
}

export type ListSummary = { ok: true; name: string; subscribers: number; production: boolean } | Refusal;

/** The list a send goes to, with its live subscriber count, for the confirmation step. */
export async function getSendList(): Promise<ListSummary> {
  const actor = await requireNewsletter();
  if (!actor.ok) return actor;
  try {
    const list = await getNewsletterList();
    return { ok: true, name: list.name, subscribers: list.subscribers, production: isProductionDeploy() };
  } catch (err) {
    return brevoFailure(err, "look up the list");
  }
}

/** The send-to-list checks every send makes: the live site, a valid time, and the typed count against a fresh one. */
async function sendChecks(when: string | null, typedCount: number): Promise<{ ok: true; at: Date | null } | Refusal> {
  if (!isProductionDeploy()) return NOT_PRODUCTION;
  const at = when === null ? null : new Date(when);
  if (at) {
    const problem = scheduleProblem(at, new Date());
    if (problem) return { ok: false, reason: "invalid", message: problem };
  }
  let subscribers: number;
  try {
    subscribers = (await getNewsletterList()).subscribers;
  } catch (err) {
    return brevoFailure(err, "look up the list");
  }
  if (typedCount !== subscribers) {
    return {
      ok: false,
      reason: "count_mismatch",
      message: `The list has ${subscribers} subscribers now. Type that number to confirm.`,
    };
  }
  return { ok: true, at };
}

const campaignName = (subject: string, at: Date) => `${subject} (${at.toISOString().slice(0, 10)})`;

/**
 * Hands the draft at `version` to Brevo for the whole list: scheduled for `when` (an ISO time
 * with offset), or sent at once when `when` is null. `typedCount` is the subscriber count the
 * admin typed to confirm.
 */
export async function scheduleNewsletter(
  id: unknown,
  version: unknown,
  when: unknown,
  typedCount: unknown,
): Promise<{ ok: true } | Refusal> {
  const actor = await requireNewsletter();
  if (!actor.ok) return actor;
  const args = z.tuple([idArg, versionArg, whenArg.nullable(), countArg]).safeParse([id, version, when, typedCount]);
  if (!args.success) return INVALID;
  const [newsletterId, at, whenIso, count] = args.data;

  const ready = await readyDraft(newsletterId, at);
  if (!ready.ok) return ready;
  if (ready.row.testedVersion !== at) {
    return {
      ok: false,
      reason: "not_ready",
      message: "Send yourself a test of this version first, and check it, before it goes to the list.",
    };
  }
  const checks = await sendChecks(whenIso, count);
  if (!checks.ok) return checks;

  const row = await claimForSubmit(newsletterId, at, actor.email);
  if (!row) return refusalFor(await getNewsletter(newsletterId), at);

  const fields = fieldsOf(row);
  const sendAt = checks.at ?? new Date();
  const content = {
    name: campaignName(fields.subject.trim(), sendAt),
    subject: fields.subject.trim(),
    previewText: fields.previewText.trim(),
    htmlContent: renderNewsletterHtml(fields, { siteUrl: siteUrl(), unsubscribeHref: BREVO_UNSUBSCRIBE_TAG }),
  };
  let campaignId = row.brevoCampaignId;
  try {
    if (campaignId === null) {
      campaignId = await createCampaign(content);
      await setCampaignId(newsletterId, campaignId);
    } else {
      await updateCampaign(campaignId, content);
    }
    if (checks.at) await scheduleCampaign(campaignId, checks.at);
    else await sendCampaignNow(campaignId);
  } catch (err) {
    await releaseClaim(newsletterId);
    return brevoFailure(err, checks.at ? "schedule the newsletter" : "send the newsletter");
  }

  await markSubmitted(newsletterId, sendAt, actor.email);
  await recordAdminAction({
    actorEmail: actor.email,
    action: checks.at ? "newsletter_schedule" : "newsletter_send_now",
    detail: { newsletter: newsletterId, campaign: campaignId, subject: fields.subject.trim(), at: sendAt.toISOString(), subscribers: count },
  });
  return { ok: true };
}

/** Loads a newsletter Brevo has scheduled and not yet started sending, or why not. */
async function scheduledNewsletter(id: string): Promise<{ ok: true; row: NewsletterRow; campaignId: number } | Refusal> {
  const row = await getNewsletter(id);
  if (!row) return NOT_FOUND;
  if (row.state !== "submitted" || row.brevoCampaignId === null) {
    return { ok: false, reason: "invalid", message: "This newsletter is not scheduled." };
  }
  let campaign;
  try {
    campaign = await getCampaign(row.brevoCampaignId);
  } catch (err) {
    return brevoFailure(err, "look up the campaign");
  }
  if (campaign?.status !== "queued") {
    return {
      ok: false,
      reason: "locked",
      message: "Brevo has already started sending this newsletter, or it is no longer scheduled, so it can't be changed.",
    };
  }
  return { ok: true, row, campaignId: row.brevoCampaignId };
}

/** Moves a scheduled newsletter to `when`, confirmed with the typed subscriber count as when it was first scheduled. */
export async function rescheduleNewsletter(id: unknown, when: unknown, typedCount: unknown): Promise<{ ok: true } | Refusal> {
  const actor = await requireNewsletter();
  if (!actor.ok) return actor;
  const args = z.tuple([idArg, whenArg, countArg]).safeParse([id, when, typedCount]);
  if (!args.success) return INVALID;
  const [newsletterId, whenIso, count] = args.data;

  const scheduled = await scheduledNewsletter(newsletterId);
  if (!scheduled.ok) return scheduled;
  const checks = await sendChecks(whenIso, count);
  if (!checks.ok) return checks;
  const at = new Date(whenIso);
  try {
    await scheduleCampaign(scheduled.campaignId, at);
  } catch (err) {
    return brevoFailure(err, "reschedule the newsletter");
  }
  await setScheduledAt(newsletterId, at);
  await recordAdminAction({
    actorEmail: actor.email,
    action: "newsletter_reschedule",
    detail: { newsletter: newsletterId, campaign: scheduled.campaignId, from: scheduled.row.scheduledAt?.toISOString() ?? null, at: at.toISOString() },
  });
  return { ok: true };
}

/** Stops a scheduled newsletter going out, and makes it an editable draft again. */
export async function cancelNewsletter(id: unknown): Promise<{ ok: true } | Refusal> {
  const actor = await requireNewsletter();
  if (!actor.ok) return actor;
  const args = idArg.safeParse(id);
  if (!args.success) return INVALID;

  const scheduled = await scheduledNewsletter(args.data);
  if (!scheduled.ok) return scheduled;
  try {
    await suspendCampaign(scheduled.campaignId);
  } catch (err) {
    return brevoFailure(err, "cancel the newsletter");
  }
  await returnToDraft(args.data, actor.email);
  await recordAdminAction({
    actorEmail: actor.email,
    action: "newsletter_cancel",
    detail: { newsletter: args.data, campaign: scheduled.campaignId, was: scheduled.row.scheduledAt?.toISOString() ?? null },
  });
  return { ok: true };
}

/**
 * Settles a newsletter whose hand-over to Brevo was interrupted (the request died part way), by
 * asking Brevo what it has: a scheduled or sent campaign makes it submitted, and no campaign,
 * or one still a Brevo draft, makes it an editable draft again.
 */
export async function recoverNewsletter(id: unknown): Promise<{ ok: true } | Refusal> {
  const actor = await requireNewsletter();
  if (!actor.ok) return actor;
  const args = idArg.safeParse(id);
  if (!args.success) return INVALID;

  const row = await getNewsletter(args.data);
  if (!row) return NOT_FOUND;
  const claimed = row.submittedAt?.getTime() ?? 0;
  if (row.state !== "submitting" || Date.now() - claimed < STUCK_AFTER_MS) {
    return { ok: false, reason: "invalid", message: "This newsletter is not stuck. Reload the page." };
  }
  let campaign = null;
  if (row.brevoCampaignId !== null) {
    try {
      campaign = await getCampaign(row.brevoCampaignId);
    } catch (err) {
      return brevoFailure(err, "look up the campaign");
    }
  }
  if (campaign === null || campaign.status === "draft") {
    await releaseClaim(args.data);
  } else {
    await markSubmitted(args.data, campaign.scheduledAt ?? campaign.sentAt ?? new Date(claimed), row.submittedBy ?? actor.email);
  }
  return { ok: true };
}
