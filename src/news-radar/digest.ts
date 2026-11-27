import { escapeHtml } from "../lib/escape-html";
import { siteUrl } from "../newsletter/site";
import { SOURCE_LABELS } from "./sources";
import type { SourceOutcome, Topic } from "./types";

/**
 * The weekly summary email: the best new items, grouped by topic, a count of known ones that
 * came back, and any source that failed. Body content for the shared email shell in
 * src/lib/email.ts, so inline styles only.
 */

/** Most items the email lists; the rest are on the admin page. */
export const DIGEST_CAP = 20;

export type DigestItem = { title: string; url: string; outlet: string; publishedAt: Date | null; topics: string[]; score: number };

/** Only web addresses become links: a source's value never becomes a `javascript:` link. */
export function safeHref(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function digestEmail({
  fresh,
  seenBefore,
  topics,
  failures,
  now,
}: {
  fresh: DigestItem[];
  seenBefore: number;
  topics: Topic[];
  failures: SourceOutcome[];
  now: Date;
}): { subject: string; bodyHtml: string } {
  const shown = [...fresh].sort((a, b) => b.score - a.score).slice(0, DIGEST_CAP);
  const order = new Map(topics.map((t, i) => [t.id, i]));
  const names = new Map(topics.map((t) => [t.id, t.name]));
  const groups = new Map<string, DigestItem[]>();
  for (const item of shown) {
    const topic = item.topics.find((t) => order.has(t)) ?? "";
    groups.set(topic, [...(groups.get(topic) ?? []), item]);
  }
  const sorted = [...groups.entries()].sort(([a], [b]) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity));
  const admin = `${siteUrl()}/admin/news-radar`;

  const sections = sorted
    .map(([topic, items]) => {
      const list = items
        .map((item) => {
          const href = safeHref(item.url);
          const title = escapeHtml(item.title);
          const link = href ? `<a href="${escapeHtml(href)}" style="color:#9b1c1f;">${title}</a>` : title;
          const meta = [item.outlet, item.publishedAt ? day(item.publishedAt) : ""].filter(Boolean).map(escapeHtml).join(" · ");
          return `<li style="margin:0 0 8px;">${link}<br><span style="font-size:14px;color:#1b334c;opacity:0.7;">${meta}</span></li>`;
        })
        .join("");
      return `<p style="margin:16px 0 8px;font-weight:bold;">${escapeHtml(names.get(topic) ?? "Other")}</p><ul style="margin:0 0 16px;padding-left:20px;">${list}</ul>`;
    })
    .join("");

  const intro =
    fresh.length === 0
      ? `<p style="margin:0 0 16px;">Nothing new this week.</p>`
      : `<p style="margin:0 0 16px;">${fresh.length === 1 ? "1 new item" : `${fresh.length} new items`} this week${
          fresh.length > shown.length ? `; the top ${shown.length} are below` : ""
        }.</p>`;
  const again =
    seenBefore > 0
      ? `<p style="margin:0 0 16px;">${seenBefore === 1 ? "1 item seen before was" : `${seenBefore} items seen before were`} found again and ${seenBefore === 1 ? "is" : "are"} still relevant.</p>`
      : "";
  const failed = failures
    .map((f) => `<p style="margin:0 0 8px;color:#9b1c1f;">${escapeHtml(SOURCE_LABELS[f.source] ?? f.source)} failed this week.</p>`)
    .join("");

  return {
    subject: `News radar: ${fresh.length === 0 ? "nothing new" : `${fresh.length} new`} for the week of ${day(now)}`,
    bodyHtml: `${intro}${sections}${again}${failed}<p style="margin:16px 0 0;"><a href="${escapeHtml(admin)}" style="color:#9b1c1f;">Triage them on the News radar page</a></p>`,
  };
}
