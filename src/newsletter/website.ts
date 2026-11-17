import { normalizeRuns, parseRichText, serializeRichText, type RichText, type Run } from "../cms/rich-text";
import { slugify, uniqueSlug } from "../opportunities/slug";

/**
 * Newsletter issues on the website, at /updates/<slug>. An admin ticks an issue to have it there,
 * before or after sending. It shows only once Brevo has said it was sent, and only while it stays
 * ticked. Its page is the body as sent: once Brevo has an issue it can't be edited.
 */

export const UPDATES_PATH = "/updates";

export const issuePath = (slug: string) => `${UPDATES_PATH}/${slug}`;

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

/** The issue's address on the website, from its subject, unique among `taken`. */
export function issueSlug(subject: string, taken: ReadonlySet<string>): string {
  return uniqueSlug(slugify(subject) || "update", taken);
}
