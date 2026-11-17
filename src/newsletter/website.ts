import { parseRichText } from "../cms/rich-text";
import { slugify, uniqueSlug } from "../opportunities/slug";

/**
 * Newsletter issues on the website, at /updates/<slug>. An admin ticks an issue to have it there,
 * before or after sending; it shows only once it has been sent, and only while it stays ticked.
 * Its page is the body as sent: once Brevo has an issue it can't be edited.
 */

export const UPDATES_PATH = "/updates";

export const issuePath = (slug: string) => `${UPDATES_PATH}/${slug}`;

/** The fields that decide whether, and where, an issue is on the website. */
export type WebsiteRow = {
  state: "draft" | "submitting" | "submitted";
  webPublished: boolean;
  webSlug: string | null;
  scheduledAt: Date | null;
  sentAt: Date | null;
};

/** When the issue went, or goes, out: Brevo's word once it has said, else the time it was given. */
export const sentDate = (row: Pick<WebsiteRow, "scheduledAt" | "sentAt">): Date | null => row.sentAt ?? row.scheduledAt;

/** Whether the issue is ticked and handed to Brevo with an address: on the website from its send time. */
export function isBoundForWebsite<T extends WebsiteRow>(row: T): row is T & { webSlug: string } {
  return row.webPublished && row.state === "submitted" && row.webSlug !== null && sentDate(row) !== null;
}

/**
 * Whether the issue is on the website at `now`: ticked, handed to Brevo, and its send time
 * passed. A scheduled issue goes up on its own at its send time; one cancelled, or stopped in
 * Brevo, is a draft again and comes down.
 */
export function isOnWebsite(row: WebsiteRow, now: Date): boolean {
  const sent = sentDate(row);
  return isBoundForWebsite(row) && sent !== null && sent.getTime() <= now.getTime();
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
