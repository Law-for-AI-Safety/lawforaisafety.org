import type { Opportunity, OpportunityType } from "./types";

export type OpportunityTypeFilter = "all" | OpportunityType;

export function filterOpportunities(items: Opportunity[], filter: OpportunityTypeFilter): Opportunity[] {
  return filter === "all" ? items : items.filter((item) => item.type === filter);
}

export function sortOpportunities(items: Opportunity[]): Opportunity[] {
  return [...items].sort((a, b) => {
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return b.publishedAt.localeCompare(a.publishedAt);
  });
}

export function daysUntil(deadline: string, now: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const [year, month, day] = deadline.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  return Math.round((target - today) / msPerDay);
}

export function isClosingSoon(deadline: string | undefined, now: Date, withinDays = 30): boolean {
  if (!deadline) return false;
  const days = daysUntil(deadline, now);
  return days >= 0 && days <= withinDays;
}

/** Renders an ISO date (YYYY-MM-DD) as e.g. "30 Oct 2026", independent of the viewer's time zone. */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
