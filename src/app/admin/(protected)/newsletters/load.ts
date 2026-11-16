import { getCampaign, type Campaign } from "@/lib/brevo-campaigns";
import { notifyIndexNowLater } from "@/lib/indexnow";
import type { NewsletterRow } from "@/lib/newsletter-store";
import { noteSent } from "@/newsletter/archive";
import { STUCK_AFTER_MS } from "@/newsletter/schedule";
import { newsletterStatus, type NewsletterStatus } from "@/newsletter/status";

/**
 * The newsletter's status, asking Brevo when it has a campaign there. A Brevo failure shows as
 * unknown. Seeing it sent for the first time records that, which puts its web page up.
 */
export async function statusOf(row: NewsletterRow): Promise<NewsletterStatus> {
  let campaign: Campaign | null | undefined = null;
  if (row.state === "submitted" && row.brevoCampaignId !== null) {
    campaign = await getCampaign(row.brevoCampaignId).catch((err) => {
      console.error(`[newsletter] Could not read Brevo campaign ${row.brevoCampaignId}`, err);
      return undefined;
    });
  }
  const now = new Date();
  const status = newsletterStatus(row, campaign, now, STUCK_AFTER_MS);
  if (status.kind === "sent" && !row.sentAt) await noteSent(row, status.at ?? now, notifyIndexNowLater);
  return status;
}
