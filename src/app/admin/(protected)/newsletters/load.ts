import { getCampaign, type Campaign } from "@/lib/brevo-campaigns";
import type { NewsletterRow } from "@/lib/newsletter-store";
import { recordSent } from "@/lib/newsletter-website";
import { STUCK_AFTER_MS } from "@/newsletter/schedule";
import { newsletterStatus, type NewsletterStatus } from "@/newsletter/status";
import { isOnWebsite, issuePath } from "@/newsletter/website";
import type { WebsiteStanding } from "./WebsiteOption";

/**
 * The newsletter's status, asking Brevo while its campaign can still change. Once Brevo says it
 * was sent, that is kept and Brevo is not asked again. A Brevo failure shows as unknown.
 */
export async function statusOf(row: NewsletterRow): Promise<NewsletterStatus> {
  if (row.state === "submitted" && row.sentAt) return { kind: "sent", at: row.sentAt, delivered: null };
  let campaign: Campaign | null | undefined = null;
  if (row.state === "submitted" && row.brevoCampaignId !== null) {
    campaign = await getCampaign(row.brevoCampaignId).catch((err) => {
      console.error(`[newsletter] Could not read Brevo campaign ${row.brevoCampaignId}`, err);
      return undefined;
    });
    if (campaign?.status === "sent") await recordSent(row, campaign.sentAt ?? new Date());
  }
  return newsletterStatus(row, campaign, new Date(), STUCK_AFTER_MS);
}

/** How many newsletters are asked about at once, so a long list does not hit Brevo's rate limit. */
const BREVO_CONCURRENCY = 4;

/** Each row's status, in order, asking Brevo a few at a time. */
export async function statusesOf(rows: NewsletterRow[]): Promise<NewsletterStatus[]> {
  const statuses: NewsletterStatus[] = new Array(rows.length);
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const i = next++;
      statuses[i] = await statusOf(rows[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(BREVO_CONCURRENCY, rows.length) }, worker));
  return statuses;
}

/** The row as `statusOf` left it: with Brevo's sent time, when it has just learnt it. */
export function withSent(row: NewsletterRow, status: NewsletterStatus): NewsletterRow {
  return status.kind === "sent" && row.sentAt === null ? { ...row, sentAt: status.at ?? new Date() } : row;
}

/** Where the issue stands on the website, for the "Also publish on the website" choice. */
export function websiteStanding(row: NewsletterRow): WebsiteStanding {
  return { on: row.webPublished, live: isOnWebsite(row), path: row.webSlug ? issuePath(row.webSlug) : null };
}
