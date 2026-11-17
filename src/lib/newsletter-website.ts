import { revalidateTag, unstable_cache } from "next/cache";
import { listWebsiteIssues } from "@/lib/newsletter-store";
import { isBoundForWebsite, issueSummary, sentDate } from "@/newsletter/website";

/**
 * The public reads of newsletter issues on the website (/updates). Only what the pages show
 * leaves here: never who wrote or sent an issue, nor an issue that is not ticked or not sent.
 */

export type WebsiteIssue = {
  slug: string;
  subject: string;
  summary: string;
  body: string;
  /** When it went out, as an ISO time. */
  sentAt: string;
};

/** Tags the cached list; `clearWebsiteIssues` drops it on every change that can move an issue on or off the site. */
export const NEWSLETTER_WEBSITE_CACHE_TAG = "newsletter-website";

/**
 * Ticked issues Brevo has, newest first, including ones scheduled for later: whether each is up
 * yet depends on the time of the request, so `issuesOnWebsite` decides that after the cache.
 */
async function readIssues(): Promise<WebsiteIssue[]> {
  const rows = await listWebsiteIssues();
  return rows
    .filter(isBoundForWebsite)
    .map((row) => ({
      slug: row.webSlug,
      subject: row.subject.trim(),
      summary: issueSummary(row.previewText, row.body),
      body: row.body,
      sentAt: (sentDate(row) ?? row.updatedAt).toISOString(),
    }))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

// Read through Next's data cache, as the opportunities board is, so a visit needn't wake the
// database. Every change made in the admin clears it at once; the hour is a backstop for
// changes made around it. On Netlify the data cache is kept per deploy.
const cachedIssues = unstable_cache(readIssues, ["newsletter-website"], { tags: [NEWSLETTER_WEBSITE_CACHE_TAG], revalidate: 3600 });

/** The issues on the website at `now`, newest first. */
export async function issuesOnWebsite(now: Date): Promise<WebsiteIssue[]> {
  return (await cachedIssues()).filter((issue) => new Date(issue.sentAt).getTime() <= now.getTime());
}

/** One issue on the website at `now`, or null. Picked from the cached list, so a made-up slug adds nothing to the cache. */
export async function issueOnWebsite(slug: string, now: Date): Promise<WebsiteIssue | null> {
  return (await issuesOnWebsite(now)).find((issue) => issue.slug === slug) ?? null;
}

/** Drops the cached list, so the next visit sees the change. */
export function clearWebsiteIssues(): void {
  revalidateTag(NEWSLETTER_WEBSITE_CACHE_TAG, { expire: 0 });
}
