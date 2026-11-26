import type { NewsRadarItem, NewsRadarRun } from "@/lib/news-radar-store";
import { SOURCE_LABELS } from "./sources";

/** How the admin page arranges items: by week first seen, newest first, one story's syndicated copies together. */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC on the Monday of `date`'s week. */
export function weekStart(date: Date): Date {
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return new Date(midnight - ((date.getUTCDay() + 6) % 7) * DAY_MS);
}

export const formatDay = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const formatTime = (d: Date) =>
  `${d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;

/** Found again by a later run than the one that first found it. */
export const isSeenBefore = (item: Pick<NewsRadarItem, "firstSeenAt" | "lastSeenAt">) => item.lastSeenAt.getTime() > item.firstSeenAt.getTime();

export type Story = { item: NewsRadarItem; alsoIn: NewsRadarItem[] };
export type Week = { start: Date; stories: Story[] };

export function groupByWeek(items: NewsRadarItem[]): Week[] {
  const weeks = new Map<number, { start: Date; stories: Map<string, Story> }>();
  for (const item of items) {
    const start = weekStart(item.firstSeenAt);
    const week = weeks.get(start.getTime()) ?? { start, stories: new Map<string, Story>() };
    weeks.set(start.getTime(), week);
    const story = week.stories.get(item.storyKey);
    if (story) story.alsoIn.push(item);
    else week.stories.set(item.storyKey, { item, alsoIn: [] });
  }
  return [...weeks.values()]
    .sort((a, b) => b.start.getTime() - a.start.getTime())
    .map((w) => ({ start: w.start, stories: [...w.stories.values()] }));
}

/** The run's status line: when, what each source returned, what was stored, the email. */
export function runSummary(run: NewsRadarRun): { when: string; sources: string[]; failures: string[]; counts: string; email: string | null } {
  const how = run.trigger === "schedule" ? "weekly run" : `run by hand${run.triggeredBy ? ` by ${run.triggeredBy}` : ""}`;
  return {
    when: run.finishedAt ? `${formatTime(run.startedAt)} (${how})` : `Running since ${formatTime(run.startedAt)} (${how})`,
    sources: run.sources.flatMap((s) => (s.ok ? [`${SOURCE_LABELS[s.source] ?? s.source}: ${s.found} found, ${s.relevant} relevant`] : [])),
    failures: run.sources.flatMap((s) => (s.ok ? [] : [`${SOURCE_LABELS[s.source] ?? s.source} failed this week: ${s.error}`])),
    counts: `${run.newCount} new, ${run.seenCount} seen before`,
    email: run.email,
  };
}
