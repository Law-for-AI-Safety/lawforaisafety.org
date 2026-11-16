import { unstable_cache } from "next/cache";
import { getCampaign } from "@/lib/brevo-campaigns";
import { notifyIndexNow } from "@/lib/indexnow";
import { getNewsletter, getWebIssueBody, listWebIssues, recordSent } from "@/lib/newsletter-store";
import { ARCHIVE_PATH, issuePath } from "./slug";

/**
 * The newsletter's public side: which issues are on the website, for the archive, the issue
 * pages and the sitemap.
 *
 * An issue is public once its web page is on and Brevo has reported it sent. Brevo is asked
 * only about an issue that is due (its send time has passed) and not yet seen sent, and its
 * answer is cached for `SENT_CHECK_SECONDS`, so a page view rarely reaches Brevo and an issue
 * goes up within minutes of Brevo finishing. The first time anyone sees it sent (here, or an
 * admin page asking Brevo for its status), `sentAt` is recorded and the search engines are told;
 * from then on Brevo is not asked about it again. No scheduled job is needed: the check runs
 * when someone, or a crawler, looks.
 */

/** Tags the public reads; the web publish and unpublish actions clear it. */
export const NEWSLETTER_WEB_CACHE_TAG = "newsletter-web";

/** How long Brevo's "not sent yet" is trusted before it is asked again. */
export const SENT_CHECK_SECONDS = 300;

/** What the public reads cache: plain data, since the cache stores JSON. */
type CachedIssue = {
  id: string;
  slug: string;
  subject: string;
  previewText: string;
  campaignId: number | null;
  scheduledAt: string | null;
  sentAt: string | null;
};

const iso = (date: Date | null) => date?.toISOString() ?? null;

// The archive and issue pages read through Next's data cache, so a visit needn't wake the
// database. Publishing or unpublishing on the web clears it. An issue Brevo has sent since the
// list was cached shows through the sent check below; once the hour has passed the list carries
// its `sentAt`. On Netlify the data cache is kept per deploy, so each deploy starts with it empty.
const cachedIssues = unstable_cache(
  async (): Promise<CachedIssue[]> =>
    (await listWebIssues()).map((row) => ({
      id: row.id,
      slug: row.slug!,
      subject: row.subject.trim(),
      previewText: row.previewText.trim(),
      campaignId: row.brevoCampaignId,
      scheduledAt: iso(row.scheduledAt),
      sentAt: iso(row.sentAt),
    })),
  ["newsletter-web-issues"],
  { tags: [NEWSLETTER_WEB_CACHE_TAG], revalidate: 3600 },
);

/**
 * Records that Brevo sent a newsletter, if no one has yet, and tells the search engines when
 * its web page has gone up with it. `announce` sends the ping: at once from a cached read, or
 * after the response from a page.
 */
export async function noteSent(
  row: { id: string; slug: string | null; publishOnWeb: boolean },
  sentAt: Date,
  announce: (paths: string[]) => unknown,
): Promise<void> {
  if ((await recordSent(row.id, sentAt)) && row.publishOnWeb && row.slug) {
    await announce([issuePath(row.slug), ARCHIVE_PATH]);
  }
}

/** When Brevo sent the newsletter, or null if it hasn't yet. Asks Brevo only until it is seen sent. */
const sentCheck = unstable_cache(
  async (id: string, campaignId: number): Promise<string | null> => {
    const row = await getNewsletter(id);
    if (!row) return null;
    if (row.sentAt) return row.sentAt.toISOString();
    const campaign = await getCampaign(campaignId);
    if (campaign?.status !== "sent") return null;
    const sentAt = campaign.sentAt ?? new Date();
    await noteSent(row, sentAt, notifyIndexNow);
    return sentAt.toISOString();
  },
  ["newsletter-sent-check"],
  { revalidate: SENT_CHECK_SECONDS },
);

async function sentAtOf(issue: CachedIssue, now: Date): Promise<string | null> {
  if (issue.sentAt) return issue.sentAt;
  const due = issue.scheduledAt !== null && new Date(issue.scheduledAt) <= now;
  if (!due || issue.campaignId === null) return null;
  // A Brevo failure is not cached, so the next view asks again.
  return sentCheck(issue.id, issue.campaignId).catch((err) => {
    console.error(`[newsletter] Could not ask Brevo whether campaign ${issue.campaignId} was sent`, err);
    return null;
  });
}

export type PublicIssue = { slug: string; subject: string; previewText: string; sentAt: Date };

/** Every issue on the website, newest first. */
export async function publicIssues(now = new Date()): Promise<PublicIssue[]> {
  const issues = await cachedIssues();
  const sent = await Promise.all(issues.map((issue) => sentAtOf(issue, now)));
  return issues
    .flatMap((issue, i) => {
      const at = sent[i];
      return at ? [{ slug: issue.slug, subject: issue.subject, previewText: issue.previewText, sentAt: new Date(at) }] : [];
    })
    .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
}

/**
 * The body, cached per issue. Asked for only once `slug` is known to be public, so a made-up
 * address adds nothing to the cache.
 */
const cachedBody = unstable_cache(getWebIssueBody, ["newsletter-web-body"], {
  tags: [NEWSLETTER_WEB_CACHE_TAG],
  revalidate: 3600,
});

/** The public issue at `slug` with its body, or null when there is none on the website. */
export async function publicIssue(slug: string, now = new Date()): Promise<(PublicIssue & { body: string }) | null> {
  const issue = (await publicIssues(now)).find((i) => i.slug === slug);
  if (!issue) return null;
  const body = await cachedBody(slug);
  return body === null ? null : { ...issue, body };
}
