import { revalidateTag, unstable_cache } from "next/cache";
import { getCampaign } from "@/lib/brevo-campaigns";
import { notifyIndexNowLater } from "@/lib/indexnow";
import { listUnconfirmedWebsiteIssues, listWebsiteIssues, markSent, type NewsletterRow } from "@/lib/newsletter-store";
import { issuePath, issueSummary, UPDATES_PATH, websiteBody } from "@/newsletter/website";

/**
 * The public reads of newsletter issues on the website (/updates), and the step that puts a
 * ticked issue up: Brevo saying it was sent. Only what the pages show leaves the reads: never
 * who wrote or sent an issue, nor an issue that is not ticked or not sent.
 */

export type WebsiteListing = {
  slug: string;
  subject: string;
  summary: string;
  /** When Brevo sent it, as an ISO time. */
  sentAt: string;
};

export type WebsiteIssue = WebsiteListing & { body: string };

/** Tags the cached reads; `clearWebsiteIssues` drops them on every change that can move an issue on or off the site. */
export const NEWSLETTER_WEBSITE_CACHE_TAG = "newsletter-website";
const PUBLIC_CACHE = { tags: [NEWSLETTER_WEBSITE_CACHE_TAG], revalidate: 3600 };

async function readListings(): Promise<WebsiteListing[]> {
  return (await listWebsiteIssues()).map((issue) => ({
    slug: issue.slug,
    subject: issue.subject.trim(),
    summary: issueSummary(issue.previewText, websiteBody(issue.body)),
    sentAt: issue.sentAt.toISOString(),
  }));
}

async function readBody(slug: string): Promise<string | null> {
  const issue = (await listWebsiteIssues()).find((row) => row.slug === slug);
  return issue ? websiteBody(issue.body) : null;
}

// Read through Next's data cache, as the opportunities board is, so a visit needn't wake the
// database. The list holds no bodies, so it stays small however many issues there are; each
// body is cached on its own, and only for a slug the list has. Every change made in the admin
// or by the sweep clears both; the hour is a backstop. On Netlify the cache is kept per deploy.
const cachedListings = unstable_cache(readListings, ["newsletter-website"], PUBLIC_CACHE);
const cachedBody = unstable_cache(readBody, ["newsletter-website-body"], PUBLIC_CACHE);

/** The issues on the website, newest first. */
export async function issuesOnWebsite(): Promise<WebsiteListing[]> {
  return cachedListings();
}

/** One issue on the website, or null. A made-up slug never reaches the body cache. */
export async function issueOnWebsite(slug: string): Promise<WebsiteIssue | null> {
  const listing = (await cachedListings()).find((issue) => issue.slug === slug);
  if (!listing) return null;
  const body = await cachedBody(slug);
  return body === null ? null : { ...listing, body };
}

/** Drops the cached reads, so the next visit sees the change. */
export function clearWebsiteIssues(): void {
  revalidateTag(NEWSLETTER_WEBSITE_CACHE_TAG, { expire: 0 });
}

/** Tells the search engines an issue's page, and the list, have changed. */
export function announceIssue(slug: string): void {
  notifyIndexNowLater([issuePath(slug), UPDATES_PATH]);
}

/**
 * Records Brevo's word that the issue was sent. A ticked one goes up on the website with it,
 * so the cache is dropped and the page announced.
 */
export async function recordSent(row: NewsletterRow, sentAt: Date): Promise<void> {
  await markSent(row.id, sentAt);
  if (!row.webPublished) return;
  clearWebsiteIssues();
  if (row.webSlug !== null && row.state !== "draft") announceIssue(row.webSlug);
}

/**
 * Asks Brevo about one ticked issue it was given and has not been heard to have sent, and puts it
 * up if it has. Returns whether it did. A Brevo failure is logged and leaves it for next time.
 */
export async function confirmSent(row: NewsletterRow): Promise<boolean> {
  if (row.brevoCampaignId === null || row.sentAt !== null) return false;
  try {
    const campaign = await getCampaign(row.brevoCampaignId);
    if (campaign?.status !== "sent") return false;
    await recordSent(row, campaign.sentAt ?? new Date());
    return true;
  } catch (err) {
    console.error(`[newsletter] Could not check with Brevo whether newsletter ${row.id} was sent`, err);
    return false;
  }
}

/**
 * Puts up every ticked issue Brevo has sent since it was last asked: run by the sweep, so a
 * scheduled issue goes up within hours of going out even if no admin opens the newsletter page.
 * Returns how many went up.
 */
export async function confirmSentIssues(now: Date): Promise<number> {
  let confirmed = 0;
  for (const row of await listUnconfirmedWebsiteIssues(now)) {
    if (await confirmSent(row)) confirmed++;
  }
  return confirmed;
}
