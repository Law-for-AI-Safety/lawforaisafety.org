"use server";

import { z } from "zod";
import { recordAdminAction } from "@/lib/audit-log";
import {
  BrevoError,
  createCampaign,
  type Campaign,
  deleteCampaign,
  getCampaign,
  getNewsletterList,
  scheduleCampaign,
  sendCampaignNow,
  suspendCampaign,
  updateCampaign,
} from "@/lib/brevo-campaigns";
import { isProductionDeploy } from "@/lib/deploy-context";
import { notifyIndexNowLater } from "@/lib/indexnow";
import { sendNewsletterTestEmail } from "@/lib/email";
import { requireNewsletter } from "@/lib/newsletter-access";
import {
  claimForSubmit,
  claimSubmitted,
  ensureWebSlug,
  getNewsletter,
  insertNewsletter,
  markSubmitted,
  markTested,
  releaseClaim,
  removeNewsletter,
  returnToDraft,
  setCampaignId,
  setWebPublished,
  unclaimSubmitted,
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
import { clearWebsiteIssues } from "@/lib/newsletter-website";
import { isOnWebsite, issuePath, UPDATES_PATH } from "@/newsletter/website";

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

const detailOf = (err: unknown) => (err instanceof BrevoError ? ` Brevo said: ${err.status} ${err.body.slice(0, 300)}` : "");

/** For a Brevo call that only reads, or that cannot have sent anything. */
function brevoFailure(err: unknown, doing: string): Refusal {
  console.error(`[newsletter] Brevo failed while ${doing}`, err);
  return { ok: false, reason: "brevo", message: `Brevo could not ${doing}. Nothing was sent.${detailOf(err)}` };
}

/**
 * Whether Brevo definitely refused a call (a 4xx answer), so it changed nothing. A server error,
 * a timeout or a lost connection may come after Brevo acted, so those leave the outcome unknown.
 */
const refusedByBrevo = (err: unknown) => err instanceof BrevoError && err.status >= 400 && err.status < 500;

/** For a call to change a campaign whose outcome Brevo left unclear: the newsletter stays claimed until someone checks. */
function brevoUnclear(err: unknown, doing: string): Refusal {
  console.error(`[newsletter] Brevo gave no clear answer while ${doing}`, err);
  return {
    ok: false,
    reason: "brevo",
    message: `Brevo did not answer clearly while trying to ${doing}, so it may or may not have done it.${detailOf(err)} In ${STUCK_AFTER_MS / 60_000} minutes, reload this page and press "Check with Brevo" to find out.`,
  };
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

  // A campaign left from a refused hand-over is a Brevo draft, which sends nothing. Anything else
  // means Brevo may send it, so the newsletter is kept to show and stop it from.
  const row = await getNewsletter(newsletterId);
  if (row?.brevoCampaignId != null) {
    let campaign;
    try {
      campaign = await getCampaign(row.brevoCampaignId);
    } catch (err) {
      return brevoFailure(err, "look up the campaign");
    }
    if (campaign !== null && campaign.status !== "draft") {
      return {
        ok: false,
        reason: "locked",
        message: `Brevo has a campaign for this newsletter that is ${campaign.status}, so it can't be deleted here. Reload the page.`,
      };
    }
  }
  const removed = await removeNewsletter(newsletterId, at);
  if (!removed) return refusalFor(await getNewsletter(newsletterId), at);
  if (removed.brevoCampaignId !== null) {
    // Only a Brevo draft, which never sends, can be left behind if this fails.
    await deleteCampaign(removed.brevoCampaignId).catch((err) =>
      console.error(`[newsletter] Could not delete draft Brevo campaign ${removed.brevoCampaignId}`, err),
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

/** A send time as typed, checked to be one Brevo should be given. */
function sendTime(when: string): { ok: true; at: Date } | Refusal {
  const at = new Date(when);
  const problem = scheduleProblem(at, new Date());
  return problem ? { ok: false, reason: "invalid", message: problem } : { ok: true, at };
}

/** The checks every send to the list makes: the live site, and the typed count against a fresh one. */
async function listChecks(typedCount: number): Promise<{ ok: true } | Refusal> {
  if (!isProductionDeploy()) return NOT_PRODUCTION;
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
  return { ok: true };
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
  let scheduleAt: Date | null = null;
  if (whenIso !== null) {
    const time = sendTime(whenIso);
    if (!time.ok) return time;
    scheduleAt = time.at;
  }
  const checks = await listChecks(count);
  if (!checks.ok) return checks;

  const row = await claimForSubmit(newsletterId, at, actor.email);
  if (!row) return refusalFor(await getNewsletter(newsletterId), at);

  const fields = fieldsOf(row);
  const sendAt = scheduleAt ?? new Date();
  const doing = scheduleAt ? "schedule the newsletter" : "send the newsletter";
  const content = {
    name: campaignName(fields.subject.trim(), sendAt),
    subject: fields.subject.trim(),
    previewText: fields.previewText.trim(),
    htmlContent: renderNewsletterHtml(fields, { siteUrl: siteUrl(), unsubscribeHref: BREVO_UNSUBSCRIBE_TAG }),
  };

  // Creating or filling in a Brevo draft campaign sends nothing, so any failure here is safe to
  // retry from a draft. A campaign Brevo no longer has is replaced.
  let campaignId = row.brevoCampaignId;
  try {
    if (campaignId !== null) {
      try {
        await updateCampaign(campaignId, content);
      } catch (err) {
        if (!(err instanceof BrevoError && err.status === 404)) throw err;
        campaignId = null;
        await setCampaignId(newsletterId, null);
      }
    }
    if (campaignId === null) {
      campaignId = await createCampaign(content);
      await setCampaignId(newsletterId, campaignId);
    }
  } catch (err) {
    await releaseClaim(newsletterId);
    return brevoFailure(err, doing);
  }

  // Scheduling or sending is the step that reaches the list. Only a refusal from Brevo is known
  // to have done nothing; any other failure leaves it claimed until someone checks with Brevo.
  try {
    if (scheduleAt) await scheduleCampaign(campaignId, scheduleAt);
    else await sendCampaignNow(campaignId);
  } catch (err) {
    if (!refusedByBrevo(err)) return brevoUnclear(err, doing);
    await releaseClaim(newsletterId);
    return brevoFailure(err, doing);
  }

  await markSubmitted(newsletterId, sendAt, actor.email);
  await recordAdminAction({
    actorEmail: actor.email,
    action: scheduleAt ? "newsletter_schedule" : "newsletter_send_now",
    detail: { newsletter: newsletterId, campaign: campaignId, subject: fields.subject.trim(), at: sendAt.toISOString(), subscribers: count },
  });
  await handedOver(newsletterId);
  return { ok: true };
}

const NOT_SCHEDULED: Refusal = { ok: false, reason: "invalid", message: "This newsletter is not scheduled." };

/**
 * Claims a newsletter Brevo has scheduled and not yet started sending, for one change, or says
 * why not. The caller ends the claim with `unclaimSubmitted` or `returnToDraft`.
 */
async function claimScheduled(id: string): Promise<{ ok: true; row: NewsletterRow; campaignId: number } | Refusal> {
  const current = await getNewsletter(id);
  if (!current) return NOT_FOUND;
  if (current.state !== "submitted" || current.brevoCampaignId === null) return NOT_SCHEDULED;
  const row = await claimSubmitted(id);
  if (!row || row.brevoCampaignId === null) {
    return { ok: false, reason: "conflict", message: "Someone else is changing this newsletter. Reload the page." };
  }
  let campaign;
  try {
    campaign = await getCampaign(row.brevoCampaignId);
  } catch (err) {
    await unclaimSubmitted(id);
    return brevoFailure(err, "look up the campaign");
  }
  if (campaign?.status !== "queued") {
    await unclaimSubmitted(id);
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

  const time = sendTime(whenIso);
  if (!time.ok) return time;
  const checks = await listChecks(count);
  if (!checks.ok) return checks;
  const scheduled = await claimScheduled(newsletterId);
  if (!scheduled.ok) return scheduled;
  try {
    await scheduleCampaign(scheduled.campaignId, time.at);
  } catch (err) {
    if (!refusedByBrevo(err)) return brevoUnclear(err, "reschedule the newsletter");
    await unclaimSubmitted(newsletterId);
    return brevoFailure(err, "reschedule the newsletter");
  }
  await unclaimSubmitted(newsletterId, time.at);
  // A ticked issue goes up on the website at its new time, not the cached old one.
  if (scheduled.row.webPublished) clearWebsiteIssues();
  await recordAdminAction({
    actorEmail: actor.email,
    action: "newsletter_reschedule",
    detail: { newsletter: newsletterId, campaign: scheduled.campaignId, from: scheduled.row.scheduledAt?.toISOString() ?? null, at: time.at.toISOString() },
  });
  return { ok: true };
}

/** Stops a scheduled newsletter going out, and makes it an editable draft again. */
export async function cancelNewsletter(id: unknown): Promise<{ ok: true } | Refusal> {
  const actor = await requireNewsletter();
  if (!actor.ok) return actor;
  const args = idArg.safeParse(id);
  if (!args.success) return INVALID;

  const scheduled = await claimScheduled(args.data);
  if (!scheduled.ok) return scheduled;
  try {
    await suspendCampaign(scheduled.campaignId);
  } catch (err) {
    if (!refusedByBrevo(err)) return brevoUnclear(err, "cancel the newsletter");
    await unclaimSubmitted(args.data);
    return brevoFailure(err, "cancel the newsletter");
  }
  await returnToDraft(args.data, actor.email);
  backToDraft(scheduled.row);
  await recordAdminAction({
    actorEmail: actor.email,
    action: "newsletter_cancel",
    detail: { newsletter: args.data, campaign: scheduled.campaignId, was: scheduled.row.scheduledAt?.toISOString() ?? null },
  });
  return { ok: true };
}

/** Brevo statuses after which a campaign will never go out. */
const STOPPED: readonly Campaign["status"][] = ["suspended", "cancelled", "archive"];

/**
 * Settles a newsletter whose change in Brevo was interrupted or left unclear, by asking Brevo
 * what it has: a campaign scheduled, sending or sent makes it handed over; no campaign, a Brevo
 * draft or a stopped campaign makes it an editable draft again.
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
  if (campaign === null) await releaseClaim(args.data, { clearCampaign: true });
  else if (campaign.status === "draft") await releaseClaim(args.data);
  else if (STOPPED.includes(campaign.status)) {
    await returnToDraft(args.data, actor.email);
    backToDraft(row);
  } else {
    await markSubmitted(args.data, campaign.scheduledAt ?? campaign.sentAt ?? new Date(claimed), row.submittedBy ?? actor.email);
    await handedOver(args.data);
  }
  return { ok: true };
}

/**
 * Makes a newsletter whose campaign Brevo has stopped (suspended, cancelled or archived there, or
 * deleted) an editable draft again, so it can be fixed and sent anew or deleted.
 */
export async function reopenNewsletter(id: unknown): Promise<{ ok: true } | Refusal> {
  const actor = await requireNewsletter();
  if (!actor.ok) return actor;
  const args = idArg.safeParse(id);
  if (!args.success) return INVALID;

  const current = await getNewsletter(args.data);
  if (!current) return NOT_FOUND;
  if (current.state !== "submitted" || current.brevoCampaignId === null) {
    return { ok: false, reason: "invalid", message: "This newsletter is not with Brevo." };
  }
  const row = await claimSubmitted(args.data);
  if (!row) return { ok: false, reason: "conflict", message: "Someone else is changing this newsletter. Reload the page." };
  let campaign;
  try {
    campaign = await getCampaign(current.brevoCampaignId);
  } catch (err) {
    await unclaimSubmitted(args.data);
    return brevoFailure(err, "look up the campaign");
  }
  if (campaign !== null && !STOPPED.includes(campaign.status)) {
    await unclaimSubmitted(args.data);
    return { ok: false, reason: "locked", message: "Brevo still has this newsletter going out, so it can't be reopened." };
  }
  await returnToDraft(args.data, actor.email);
  backToDraft(current);
  await recordAdminAction({
    actorEmail: actor.email,
    action: "newsletter_cancel",
    detail: { newsletter: args.data, campaign: current.brevoCampaignId, reopened: campaign?.status ?? "deleted" },
  });
  return { ok: true };
}

/**
 * After Brevo has taken an issue: a ticked one gets its website address, and goes up on the
 * website at its send time, at once for one sent now.
 */
async function handedOver(id: string): Promise<void> {
  // The email is with Brevo by now, so a failure here must not report the send as failed. The
  // issue then has no address yet; unticking and ticking it again gives it one.
  let row;
  try {
    row = await ensureWebSlug(id);
  } catch (err) {
    console.error(`[newsletter] Could not give newsletter ${id} its website address`, err);
    return;
  }
  if (!row?.webPublished) return;
  clearWebsiteIssues();
  if (row.webSlug && isOnWebsite(row, new Date())) notifyIndexNowLater([issuePath(row.webSlug), UPDATES_PATH]);
}

/**
 * After an issue becomes a draft again: a ticked one comes off the website. `was` is the row as
 * it stood before, mid-change or not, so a page that was up is announced as gone.
 */
function backToDraft(was: NewsletterRow): void {
  if (!was.webPublished) return;
  clearWebsiteIssues();
  if (was.webSlug && isOnWebsite({ ...was, state: "submitted" }, new Date())) notifyIndexNowLater([issuePath(was.webSlug), UPDATES_PATH]);
}

export type WebsiteResult = { ok: true; onWebsite: boolean; path: string | null } | Refusal;

/**
 * Ticks the issue to be on the website as well (`on`), or takes it off. Works at any stage: a
 * draft or scheduled issue goes up once sent, a sent one at once. Taking it off changes nothing
 * in the email, sent or still to go.
 */
export async function setNewsletterOnWebsite(id: unknown, on: unknown): Promise<WebsiteResult> {
  const actor = await requireNewsletter();
  if (!actor.ok) return actor;
  const args = z.tuple([idArg, z.boolean()]).safeParse([id, on]);
  if (!args.success) return INVALID;
  const [newsletterId, publish] = args.data;

  const before = await getNewsletter(newsletterId);
  if (!before) return NOT_FOUND;
  const now = new Date();
  const wasUp = isOnWebsite(before, now);
  let row = await setWebPublished(newsletterId, publish);
  if (!row) return NOT_FOUND;
  if (publish) row = (await ensureWebSlug(newsletterId)) ?? row;
  const isUp = isOnWebsite(row, now);
  clearWebsiteIssues();
  if (row.webSlug && wasUp !== isUp) notifyIndexNowLater([issuePath(row.webSlug), UPDATES_PATH]);

  if (before.webPublished !== publish) {
    await recordAdminAction({
      actorEmail: actor.email,
      action: publish ? "newsletter_web_publish" : "newsletter_web_unpublish",
      detail: { newsletter: newsletterId, subject: row.subject.trim(), slug: row.webSlug, live: publish ? isUp : wasUp },
    });
  }
  return { ok: true, onWebsite: isUp, path: row.webSlug ? issuePath(row.webSlug) : null };
}
