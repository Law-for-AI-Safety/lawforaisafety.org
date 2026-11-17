import { emailSender, GENERAL_NOTIFY_EMAIL } from "./email";

/**
 * Brevo's email campaign API, which sends the newsletter to the list. Brevo holds the list and
 * does the sending and the scheduling; this only hands it the campaign and asks how it went.
 * Every call goes through `fetch`, faked in tests by test/fakes/brevo.ts.
 */

export const BREVO_API = "https://api.brevo.com/v3";

export class BrevoError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    what: string,
  ) {
    super(`Brevo ${what} failed: ${status} ${body}`);
    this.name = "BrevoError";
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function brevo(method: string, path: string, what: string, body?: unknown): Promise<Response> {
  const res = await fetch(`${BREVO_API}${path}`, {
    method,
    headers: {
      "api-key": requireEnv("BREVO_API_KEY"),
      accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new BrevoError(res.status, await res.text().catch(() => ""), what);
  return res;
}

/** The newsletter list: the one `BREVO_LIST_ID` names, which sign-ups are added to. */
export function newsletterListId(): number {
  return Number(requireEnv("BREVO_LIST_ID"));
}

export type BrevoList = { id: number; name: string; subscribers: number };

export async function getNewsletterList(): Promise<BrevoList> {
  const id = newsletterListId();
  const res = await brevo("GET", `/contacts/lists/${id}`, "list lookup");
  const list = (await res.json()) as { id: number; name: string; totalSubscribers: number };
  return { id: list.id, name: list.name, subscribers: list.totalSubscribers };
}

export type CampaignContent = { name: string; subject: string; previewText: string; htmlContent: string };

function campaignBody(content: CampaignContent) {
  return {
    name: content.name,
    subject: content.subject,
    previewText: content.previewText,
    htmlContent: content.htmlContent,
    sender: emailSender(),
    replyTo: GENERAL_NOTIFY_EMAIL,
    recipients: { listIds: [newsletterListId()] },
  };
}

/** Creates the campaign as a Brevo draft, which sends nothing until it is scheduled or sent. */
export async function createCampaign(content: CampaignContent): Promise<number> {
  const res = await brevo("POST", "/emailCampaigns", "campaign create", campaignBody(content));
  return ((await res.json()) as { id: number }).id;
}

/** Replaces a draft campaign's content (one left behind by an attempt that failed part way). */
export async function updateCampaign(id: number, content: CampaignContent): Promise<void> {
  await brevo("PUT", `/emailCampaigns/${id}`, "campaign update", campaignBody(content));
}

/** Schedules a draft campaign, or moves a scheduled one to a new time. */
export async function scheduleCampaign(id: number, at: Date): Promise<void> {
  await brevo("PUT", `/emailCampaigns/${id}`, "campaign schedule", { scheduledAt: at.toISOString() });
}

export async function sendCampaignNow(id: number): Promise<void> {
  await brevo("POST", `/emailCampaigns/${id}/sendNow`, "campaign send");
}

/** Stops a scheduled campaign from going out. Brevo keeps it, suspended. */
export async function suspendCampaign(id: number): Promise<void> {
  await brevo("PUT", `/emailCampaigns/${id}/status`, "campaign cancel", { status: "suspended" });
}

/** Removes a campaign that was never scheduled. */
export async function deleteCampaign(id: number): Promise<void> {
  await brevo("DELETE", `/emailCampaigns/${id}`, "campaign delete");
}

export type CampaignStatus =
  | "draft"
  | "queued"
  | "in_process"
  | "in_review"
  | "sent"
  | "suspended"
  | "archive"
  | "cancelling"
  | "cancelled";

export type Campaign = {
  id: number;
  status: CampaignStatus;
  scheduledAt: Date | null;
  sentAt: Date | null;
  delivered: number | null;
};

const dateOrNull = (value: string | undefined) => (value ? new Date(value) : null);

/** The campaign as Brevo has it now, or null when Brevo has no such campaign. */
export async function getCampaign(id: number): Promise<Campaign | null> {
  let res: Response;
  try {
    res = await brevo("GET", `/emailCampaigns/${id}?excludeHtmlContent=true&statistics=globalStats`, "campaign lookup");
  } catch (err) {
    if (err instanceof BrevoError && err.status === 404) return null;
    throw err;
  }
  const campaign = (await res.json()) as {
    id: number;
    status: CampaignStatus;
    scheduledAt?: string;
    sentDate?: string;
    statistics?: { globalStats?: { delivered?: number | null } };
  };
  return {
    id: campaign.id,
    status: campaign.status,
    scheduledAt: dateOrNull(campaign.scheduledAt),
    sentAt: dateOrNull(campaign.sentDate),
    delivered: campaign.statistics?.globalStats?.delivered ?? null,
  };
}
