import { getCampaign, type Campaign } from "@/lib/brevo-campaigns";
import type { NewsletterRow } from "@/lib/newsletter-store";
import { STUCK_AFTER_MS } from "@/newsletter/schedule";
import { newsletterStatus, type NewsletterStatus } from "@/newsletter/status";

/** The newsletter's status, asking Brevo when it has a campaign there. A Brevo failure shows as unknown. */
export async function statusOf(row: NewsletterRow): Promise<NewsletterStatus> {
  let campaign: Campaign | null | undefined = null;
  if (row.state === "submitted" && row.brevoCampaignId !== null) {
    campaign = await getCampaign(row.brevoCampaignId).catch((err) => {
      console.error(`[newsletter] Could not read Brevo campaign ${row.brevoCampaignId}`, err);
      return undefined;
    });
  }
  return newsletterStatus(row, campaign, new Date(), STUCK_AFTER_MS);
}
