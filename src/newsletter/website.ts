import { normalizeRuns, parseRichText, serializeRichText, type RichText, type Run } from "../cms/rich-text";
import { slugify, uniqueSlug } from "../opportunities/slug";

/**
 * Newsletter issues on the website, at /newsletter/<slug>. A new issue starts ticked to go there,
 * and an admin can untick or tick it again before or after sending. It shows only once Brevo has
 * said it was sent, and only while it stays ticked. Its page is the body as sent: once Brevo has an issue it can't be edited.
 */

/**
 * The newsletter's page, with the sign-up and the issues on the website, and what it is called
 * (its heading, and the footer's link). Each issue's page sits under it.
 */
export const NEWSLETTER_PATH = "/newsletter";
export const NEWSLETTER_LABEL = "Newsletter";

/**
 * The pages of the sign-up flow under /newsletter (src/app/newsletter), which no issue may take
 * as its address. A test checks this against the folders there.
 */
export const RESERVED_ISSUE_SLUGS: readonly string[] = ["confirm", "confirmed", "invalid"];

export const issuePath = (slug: string) => `${NEWSLETTER_PATH}/${slug}`;

/** The fields that decide whether, and where, an issue is on the website. */
export type WebsiteRow = {
  state: "draft" | "submitting" | "submitted";
  webPublished: boolean;
  webSlug: string | null;
  sentAt: Date | null;
};

/**
 * Whether the issue is on the website: ticked, given an address, and sent by Brevo's own word
 * (`sentAt`), never just because its send time has passed. A sent issue mid-change (claimed for a
 * check with Brevo) stays up; a draft, cancelled or reopened, is down.
 */
export function isOnWebsite<T extends WebsiteRow>(row: T): row is T & { webSlug: string; sentAt: Date } {
  return row.webPublished && row.state !== "draft" && row.webSlug !== null && row.sentAt !== null;
}

/** Brevo's merge tags (`{{ contact.FIRSTNAME }}`), filled in per subscriber in the email. */
const MERGE_TAG = /\s*\{\{[^{}]*\}\}/g;

/**
 * The body as the website shows it: the email's, without Brevo's merge tags, which have no
 * subscriber to be filled in for. Text that can't be read is returned as it is.
 */
export function websiteBody(body: string): string {
  if (!body.includes("{{")) return body;
  try {
    const doc = parseRichText(body).flatMap((block): RichText => {
      if (block.type === "paragraph") {
        const runs = stripTags(block.runs);
        return runs.length > 0 ? [{ type: "paragraph", runs }] : [];
      }
      const items = block.items.map(stripTags).filter((item) => item.length > 0);
      return items.length > 0 ? [{ type: "bulletList", items }] : [];
    });
    return serializeRichText(doc);
  } catch {
    return body;
  }
}

function stripTags(runs: Run[]): Run[] {
  const stripped = normalizeRuns(runs.map((run) => ({ text: run.text.replace(MERGE_TAG, ""), marks: run.marks })));
  // A line that started with a tag ("{{ contact.FIRSTNAME }}, hello") would start with a space.
  if (stripped.length > 0) stripped[0] = { ...stripped[0], text: stripped[0].text.trimStart() };
  if (stripped.length > 0) stripped[stripped.length - 1] = { ...stripped[stripped.length - 1], text: stripped[stripped.length - 1].text.trimEnd() };
  return normalizeRuns(stripped);
}

const MAX_SUMMARY = 200;

/**
 * The line search results and link previews show: the preview text, or else the start of the
 * body as plain text, cut at a word.
 */
export function issueSummary(previewText: string, body: string): string {
  const preview = previewText.trim();
  if (preview !== "") return preview;
  let text = "";
  try {
    const first = parseRichText(body)[0];
    const runs = first?.type === "paragraph" ? first.runs : (first?.items[0] ?? []);
    text = runs.map((run) => run.text).join("").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
  if (text.length <= MAX_SUMMARY) return text;
  const cut = text.slice(0, MAX_SUMMARY);
  const space = cut.lastIndexOf(" ");
  return `${(space > MAX_SUMMARY / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

/** What an issue's address is made from: its subject, as a slug. */
export const issueSlugBase = (subject: string) => slugify(subject) || "issue";

/**
 * The issue's address on the website: `issueSlugBase`, numbered when it is among `taken` (every
 * address in use that starts with it) or a page of the sign-up flow.
 */
export function issueSlug(subject: string, taken: ReadonlySet<string>): string {
  return uniqueSlug(issueSlugBase(subject), new Set([...RESERVED_ISSUE_SLUGS, ...taken]));
}
