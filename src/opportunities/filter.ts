import { COUNTRIES } from "./countries";
import { OPPORTUNITY_TYPES } from "./kinds";
import type { Opportunity, OpportunityRound, OpportunityType } from "./types";

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
  const place = locationCountry === "GLOBAL" ? "Global" : [locationCity, countryName(locationCountry)].filter(Boolean).join(", ");
  return locationNote ? `${place} · ${locationNote}` : place;
}

/** The board's orders: soonest closing date first, or most recently published first. */
export const OPPORTUNITY_SORTS = ["closing", "newest"] as const;
export type OpportunitySort = (typeof OPPORTUNITY_SORTS)[number];

/**
 * What the board is narrowed to, and the order it is listed in. No types means every type. No locations means anywhere;
 * otherwise a listing shows if it is based in one of `countries`, or, with `global`, if it is
 * remote or has no single base country.
 */
export type OpportunityFilters = {
  types: OpportunityType[];
  countries: string[];
  global: boolean;
  closingSoon: boolean;
  sort: OpportunitySort;
};

export const DEFAULT_FILTERS: OpportunityFilters = {
  types: [],
  countries: [],
  global: false,
  closingSoon: false,
  sort: "closing",
};

/** The `location` value, in any case, that stands for global and remote listings, beside country codes. */
const GLOBAL_LOCATION = "global";

/** Reads filters from the board's query string, dropping any value it does not recognise. */
export function parseFilters(params: URLSearchParams): OpportunityFilters {
  const requested = new Set((params.get("type") ?? "").split(","));
  const locations = (params.get("location") ?? "").split(",");
  const countries = locations.map((code) => code.toUpperCase()).filter((code) => Object.hasOwn(COUNTRY_NAME, code));
  return {
    types: OPPORTUNITY_TYPES.filter((type) => requested.has(type)),
    countries: [...new Set(countries)].sort(),
    global: locations.some((location) => location.toLowerCase() === GLOBAL_LOCATION),
    closingSoon: params.get("soon") === "1",
    sort: OPPORTUNITY_SORTS.find((sort) => sort === params.get("sort")) ?? DEFAULT_FILTERS.sort,
  };
}

/** The query string for a set of filters, without the leading "?"; empty for the defaults. */
export function serializeFilters(filters: OpportunityFilters): string {
  const params = new URLSearchParams();
  if (filters.types.length > 0) params.set("type", OPPORTUNITY_TYPES.filter((type) => filters.types.includes(type)).join(","));
  const locations = [...filters.countries].sort();
  if (filters.global) locations.push(GLOBAL_LOCATION);
  if (locations.length > 0) params.set("location", locations.join(","));
  if (filters.closingSoon) params.set("soon", "1");
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set("sort", filters.sort);
  // Commas are safe in a query string, and "type=job,event" reads better than "job%2Cevent".
  return params.toString().replaceAll("%2C", ",");
}

/** Whether anything narrows the board. The order it is listed in narrows nothing. */
export function hasActiveFilters({ types, countries, global, closingSoon }: OpportunityFilters): boolean {
  return types.length > 0 || countries.length > 0 || global || closingSoon;
}

/** Remote, or with no single base country: what the "Global and remote" location covers. */
function isGlobalOrRemote(item: Pick<Opportunity, "remote" | "locationCountry">): boolean {
  return item.remote || item.locationCountry === "GLOBAL";
}

export function filterOpportunities(items: Opportunity[], filters: OpportunityFilters, now: Date): Opportunity[] {
  const { types, countries, global, closingSoon } = filters;
  const anywhere = countries.length === 0 && !global;
  return items.filter((item) => {
    if (types.length > 0 && !types.includes(item.type)) return false;
    if (closingSoon && !isClosingSoon(item, now)) return false;
    return anywhere || countries.includes(item.locationCountry) || (global && isGlobalOrRemote(item));
  });
}

export type CountryOption = { code: string; name: string; count: number };

/**
 * The choices for the location filter, with how many of `items` each covers: global and remote
 * listings, then the countries listings are based in, by name. A remote listing based in a
 * country counts under both. A `selected` country
 * with no listings is still offered, so the list can show what the URL asked for.
 */
export function locationOptions(
  items: Opportunity[],
  selected: string[] = [],
): { globalCount: number; countries: CountryOption[] } {
  const counts = new Map<string, number>(selected.map((code) => [code, 0]));
  for (const item of items) {
    if (item.locationCountry === "GLOBAL") continue;
    counts.set(item.locationCountry, (counts.get(item.locationCountry) ?? 0) + 1);
  }
  return {
    globalCount: items.filter(isGlobalOrRemote).length,
    countries: [...counts]
      .map(([code, count]) => ({ code, name: countryName(code), count }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** A country's name from its ISO code, or the code itself when it has none. */
export function countryName(code: string): string {
  return COUNTRY_NAME[code] ?? code;
}

export type ClosingFields = Pick<Opportunity, "type" | "deadline" | "startDate" | "endDate" | "rounds">;
/** One run's dates: a listing's own, or one of its rounds'. */
export type RoundDates = Pick<OpportunityRound, "deadline" | "startDate" | "endDate">;

/**
 * The last day one run can be acted on: its deadline, or with no separate deadline, an event's
 * own last day, or the day a course starts. Undefined means it never closes.
 */
function runClosingDate(type: OpportunityType, dates: RoundDates): string | undefined {
  if (dates.deadline) return dates.deadline;
  if (type === "event") return dates.endDate ?? dates.startDate;
  if (type === "course") return dates.startDate;
  return undefined;
}

/** Anywhere on Earth (UTC−12), the last time zone where a given day ends. */
const ANYWHERE_ON_EARTH_OFFSET_MS = 12 * 60 * 60 * 1000;

/** Whole days left until a closing day ends Anywhere on Earth; negative once it has passed. */
function daysLeftUntil(closes: string | undefined, now: Date): number | undefined {
  return closes === undefined ? undefined : daysUntil(closes, new Date(now.getTime() - ANYWHERE_ON_EARTH_OFFSET_MS));
}

export type RoundView = {
  round: OpportunityRound;
  /** Its place in `rounds` as entered, counting from 0. */
  index: number;
  closes: string | undefined;
  closed: boolean;
};

/** Rounds in the order they close, soonest first; a round that never closes goes last, ties as entered. */
function byClosing(type: OpportunityType, rounds: OpportunityRound[]) {
  return rounds
    .map((round, index) => ({ round, index, closes: runClosingDate(type, round) }))
    .sort((a, b) => {
      if (a.closes && b.closes) return a.closes.localeCompare(b.closes) || a.index - b.index;
      if (a.closes) return -1;
      if (b.closes) return 1;
      return a.index - b.index;
    });
}

/**
 * A listing's rounds put in the order they close, as they are saved, so "Round 2" in the admin
 * form is the second round to close on the public page too.
 */
export function sortRounds(type: OpportunityType, rounds: OpportunityRound[]): OpportunityRound[] {
  return byClosing(type, rounds).map(({ round }) => round);
}

/**
 * A listing's rounds in the order they close, soonest first, each marked closed or not. A round
 * that never closes goes last. Empty for a listing with single dates.
 */
export function roundsByClosing(opportunity: ClosingFields, now: Date): RoundView[] {
  return byClosing(opportunity.type, opportunity.rounds ?? []).map((view) => {
    const days = daysLeftUntil(view.closes, now);
    return { ...view, closed: days !== undefined && days < 0 };
  });
}

export type CurrentRun = RoundDates & {
  /** The round shown, when the listing has rounds. */
  round?: RoundView;
  /** How many open rounds come after it. */
  moreRounds: number;
};

/**
 * The dates the board goes by. For a listing with rounds, the round open now that closes
 * soonest, or once every round has closed, the last to close; past rounds otherwise count for
 * nothing. For any other listing, its own dates.
 */
export function currentRun(opportunity: ClosingFields, now: Date): CurrentRun {
  const rounds = roundsByClosing(opportunity, now);
  if (rounds.length === 0) {
    const { deadline, startDate, endDate } = opportunity;
    return { deadline, startDate, endDate, moreRounds: 0 };
  }
  const open = rounds.filter((view) => !view.closed);
  const round = open[0] ?? rounds[rounds.length - 1];
  const { deadline, startDate, endDate } = round.round;
  return { deadline, startDate, endDate, round, moreRounds: Math.max(open.length - 1, 0) };
}

/**
 * The last day a listing can be acted on, from `currentRun`: so a listing with rounds closes
 * with its last round. Undefined means it never closes.
 */
export function closingDate(opportunity: ClosingFields, now: Date): string | undefined {
  return runClosingDate(opportunity.type, currentRun(opportunity, now));
}

/**
 * Orders listings. By closing date, those with one come first, soonest first, then the rest
 * newest first. By newest, every listing goes by when it was published.
 */
export function sortOpportunities<T extends Opportunity>(items: T[], sort: OpportunitySort, now: Date): T[] {
  // A draft has no published date yet, so it sorts as the oldest.
  const newestFirst = (a: T, b: T) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
  if (sort === "newest") return [...items].sort(newestFirst);
  const closes = new Map(items.map((item) => [item, closingDate(item, now)]));
  return [...items].sort((a, b) => {
    const aCloses = closes.get(a);
    const bCloses = closes.get(b);
    if (aCloses && bCloses) return aCloses.localeCompare(bCloses);
    if (aCloses) return -1;
    if (bCloses) return 1;
    return newestFirst(a, b);
  });
}

export function daysUntil(deadline: string, now: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const [year, month, day] = deadline.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  return Math.round((target - today) / msPerDay);
}

/** Whole days left until the listing's closing day ends Anywhere on Earth; negative once it has closed. */
function daysLeft(opportunity: ClosingFields, now: Date): number | undefined {
  return daysLeftUntil(closingDate(opportunity, now), now);
}

/** Still open, and closing within `withinDays`, on the same clock as `isClosed`. */
export function isClosingSoon(opportunity: ClosingFields, now: Date, withinDays = 30): boolean {
  const days = daysLeft(opportunity, now);
  return days !== undefined && days >= 0 && days <= withinDays;
}

/**
 * Closed once its closing day has ended everywhere (Anywhere on Earth), so no applicant loses
 * the apply button while it is still that day where they are.
 */
export function isClosed(opportunity: ClosingFields, now: Date): boolean {
  const days = daysLeft(opportunity, now);
  return days !== undefined && days < 0;
}

export function openOpportunities<T extends Opportunity>(items: T[], now: Date): T[] {
  return items.filter((item) => !isClosed(item, now));
}

/** An event's date, or its first and last days for a multi-day event, e.g. "30 Oct 2026 – 1 Nov 2026". */
export function formatEventDates(opportunity: Pick<RoundDates, "startDate" | "endDate">): string | undefined {
  const { startDate, endDate } = opportunity;
  if (!startDate) return undefined;
  return endDate && endDate !== startDate ? `${formatDate(startDate)} – ${formatDate(endDate)}` : formatDate(startDate);
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
