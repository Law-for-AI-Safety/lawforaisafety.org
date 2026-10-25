import { COUNTRIES } from "./countries";
import type { Opportunity, OpportunityType } from "./types";

export type OpportunityTypeFilter = "all" | OpportunityType;

const COUNTRY_NAME: Record<string, string> = Object.fromEntries(COUNTRIES.map((c) => [c.code, c.name]));

const COMMITMENT_LABEL: Record<NonNullable<Opportunity["commitment"]>, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  fellowship: "Fellowship",
};

const COMP_CURRENCY_SYMBOL: Record<NonNullable<Opportunity["compCurrency"]>, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
};

const COMP_PERIOD_LABEL: Record<NonNullable<Opportunity["compPeriod"]>, string> = {
  year: "year",
  month: "month",
  week: "week",
  day: "day",
  hour: "hour",
};

export function formatCommitment(opportunity: Pick<Opportunity, "commitment">): string | undefined {
  return opportunity.commitment ? COMMITMENT_LABEL[opportunity.commitment] : undefined;
}

/** Joins the structured amount/currency/period into one range, with any free-text caveat appended. */
export function formatCompensation(
  opportunity: Pick<Opportunity, "compMin" | "compMax" | "compCurrency" | "compPeriod" | "compNote">,
): string | undefined {
  const { compMin, compMax, compCurrency, compPeriod, compNote } = opportunity;
  const parts: string[] = [];

  if (compMin !== undefined || compMax !== undefined) {
    const symbol = compCurrency ? COMP_CURRENCY_SYMBOL[compCurrency] : "";
    const amount =
      compMin !== undefined && compMax !== undefined && compMin !== compMax
        ? `${symbol}${compMin.toLocaleString()}–${symbol}${compMax.toLocaleString()}`
        : `${symbol}${(compMin ?? compMax)!.toLocaleString()}`;
    const period = compPeriod ? `/${COMP_PERIOD_LABEL[compPeriod]}` : "";
    parts.push(`${amount}${period}`);
  }
  if (compNote) parts.push(compNote);

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** City + country name, or "Global" for a role with no single base country; any note is appended. */
export function formatLocation(opportunity: Pick<Opportunity, "locationCountry" | "locationCity" | "locationNote">): string {
  const { locationCountry, locationCity, locationNote } = opportunity;
  const place = locationCountry === "GLOBAL" ? "Global" : [locationCity, COUNTRY_NAME[locationCountry] ?? locationCountry].filter(Boolean).join(", ");
  return locationNote ? `${place} · ${locationNote}` : place;
}

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

/** Anywhere on Earth (UTC−12), the last time zone where a given day ends. */
const ANYWHERE_ON_EARTH_OFFSET_MS = 12 * 60 * 60 * 1000;

/**
 * Closed once the deadline day has ended everywhere (Anywhere on Earth), so no applicant loses
 * the apply button while it is still the deadline day where they are. A listing with no
 * deadline never closes.
 */
export function isClosed(deadline: string | undefined, now: Date): boolean {
  return deadline !== undefined && daysUntil(deadline, new Date(now.getTime() - ANYWHERE_ON_EARTH_OFFSET_MS)) < 0;
}

export function openOpportunities(items: Opportunity[], now: Date): Opportunity[] {
  return items.filter((item) => !isClosed(item.deadline, now));
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
