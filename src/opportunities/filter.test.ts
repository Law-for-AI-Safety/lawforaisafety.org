import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closingDate,
  countryOptions,
  daysUntil,
  DEFAULT_FILTERS,
  filterOpportunities,
  formatCommitment,
  formatCompensation,
  formatDate,
  formatEventDates,
  formatLocation,
  hasActiveFilters,
  isClosed,
  isClosingSoon,
  openOpportunities,
  parseFilters,
  serializeFilters,
  sortOpportunities,
} from "./filter";
import type { Opportunity } from "./types";

function make(overrides: Partial<Opportunity>): Opportunity {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    slug: "test",
    type: "job",
    title: "Test role",
    org: "Test org",
    summary: "A test opportunity.",
    description: "Body.",
    locationCountry: "GLOBAL",
    remote: true,
    applyUrl: "https://example.com/apply",
    publishedAt: "2026-01-01",
    ...overrides,
  };
}

describe("parseFilters", () => {
  const parse = (query: string) => parseFilters(new URLSearchParams(query));

  it("gives the defaults for an empty query", () => {
    expect(parse("")).toEqual(DEFAULT_FILTERS);
  });

  it("reads every filter", () => {
    expect(parse("type=job,fellowship&country=GB&local=1&soon=1")).toEqual({
      types: ["job", "fellowship"],
      country: "GB",
      includeGlobal: false,
      closingSoon: true,
    });
  });

  it("drops unknown types and keeps the board's order without repeats", () => {
    expect(parse("type=event,nonsense,job,event").types).toEqual(["job", "event"]);
  });

  it("accepts a lower-case country code", () => {
    expect(parse("country=gb").country).toBe("GB");
  });

  it("ignores an unknown country, and GLOBAL, which the checkbox covers", () => {
    expect(parse("country=XX").country).toBeUndefined();
    expect(parse("country=GLOBAL").country).toBeUndefined();
    expect(parse("country=constructor").country).toBeUndefined();
  });

  it("ignores other values for the checkboxes", () => {
    expect(parse("local=yes&soon=true")).toEqual(DEFAULT_FILTERS);
  });
});

describe("serializeFilters", () => {
  it("gives an empty query for the defaults", () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe("");
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
  });

  it("writes every filter, with types in the board's order", () => {
    const query = serializeFilters({ types: ["event", "job"], country: "GB", includeGlobal: false, closingSoon: true });
    expect(query).toBe("type=job,event&country=GB&local=1&soon=1");
    expect(parseFilters(new URLSearchParams(query))).toEqual({
      types: ["job", "event"],
      country: "GB",
      includeGlobal: false,
      closingSoon: true,
    });
  });

  it("counts any one filter as active", () => {
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, types: ["course"] })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, country: "FR" })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, includeGlobal: false })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, closingSoon: true })).toBe(true);
  });
});

describe("filterOpportunities", () => {
  const now = new Date("2026-10-31T12:00:00Z");
  const items = [
    make({ slug: "gb-office", type: "job", locationCountry: "GB", remote: false }),
    make({ slug: "gb-remote", type: "fellowship", locationCountry: "GB", remote: true }),
    make({ slug: "fr-office", type: "course", locationCountry: "FR", remote: false, deadline: "2026-11-10" }),
    make({ slug: "global", type: "event", locationCountry: "GLOBAL", remote: true }),
    make({ slug: "us-remote", type: "job", locationCountry: "US", remote: true, deadline: "2027-06-01" }),
  ];
  const slugs = (filters: Partial<typeof DEFAULT_FILTERS>) =>
    filterOpportunities(items, { ...DEFAULT_FILTERS, ...filters }, now).map((i) => i.slug);

  it("returns everything for the defaults", () => {
    expect(slugs({})).toEqual(items.map((i) => i.slug));
  });

  it("keeps only the chosen types", () => {
    expect(slugs({ types: ["job"] })).toEqual(["gb-office", "us-remote"]);
    expect(slugs({ types: ["course", "event"] })).toEqual(["fr-office", "global"]);
  });

  it("shows a country's listings and the global ones", () => {
    expect(slugs({ country: "GB" })).toEqual(["gb-office", "gb-remote", "global"]);
  });

  it("shows only in-person listings when global and remote are left out", () => {
    expect(slugs({ includeGlobal: false })).toEqual(["gb-office", "fr-office"]);
  });

  it("shows only a country's in-person listings when global and remote are left out", () => {
    expect(slugs({ country: "GB", includeGlobal: false })).toEqual(["gb-office"]);
  });

  it("keeps only listings closing soon", () => {
    expect(slugs({ closingSoon: true })).toEqual(["fr-office"]);
  });

  it("combines filters", () => {
    expect(slugs({ types: ["job", "fellowship"], country: "GB", includeGlobal: false })).toEqual(["gb-office"]);
  });
});

describe("countryOptions", () => {
  const items = [
    make({ locationCountry: "US" }),
    make({ locationCountry: "GB" }),
    make({ locationCountry: "GLOBAL" }),
    make({ locationCountry: "GB" }),
  ];

  it("lists the countries listings are based in, by name, with counts, leaving out GLOBAL", () => {
    expect(countryOptions(items)).toEqual([
      { code: "GB", name: "United Kingdom", count: 2 },
      { code: "US", name: "United States", count: 1 },
    ]);
  });

  it("still offers a selected country with no listings", () => {
    expect(countryOptions(items, "FR")[0]).toEqual({ code: "FR", name: "France", count: 0 });
  });

  it("falls back to the code for a country it has no name for", () => {
    expect(countryOptions([make({ locationCountry: "ZZ" })])).toEqual([{ code: "ZZ", name: "ZZ", count: 1 }]);
  });
});

describe("sortOpportunities", () => {
  it("orders by soonest deadline first", () => {
    const items = [
      make({ slug: "later", deadline: "2026-12-01" }),
      make({ slug: "soon", deadline: "2026-11-01" }),
    ];
    expect(sortOpportunities(items).map((i) => i.slug)).toEqual(["soon", "later"]);
  });

  it("orders an event with no deadline by its date", () => {
    const items = [
      make({ slug: "later", deadline: "2026-12-01" }),
      make({ slug: "event", type: "event", startDate: "2026-11-01" }),
    ];
    expect(sortOpportunities(items).map((i) => i.slug)).toEqual(["event", "later"]);
  });

  it("puts undated items after dated ones", () => {
    const items = [make({ slug: "undated" }), make({ slug: "dated", deadline: "2026-11-01" })];
    expect(sortOpportunities(items).map((i) => i.slug)).toEqual(["dated", "undated"]);
  });

  it("breaks undated ties by most recently published first", () => {
    const items = [
      make({ slug: "older", publishedAt: "2026-01-01" }),
      make({ slug: "newer", publishedAt: "2026-06-01" }),
    ];
    expect(sortOpportunities(items).map((i) => i.slug)).toEqual(["newer", "older"]);
  });

  it("does not mutate the input array", () => {
    const items = [make({ slug: "a", deadline: "2026-12-01" }), make({ slug: "b", deadline: "2026-01-01" })];
    const copy = [...items];
    sortOpportunities(items);
    expect(items).toEqual(copy);
  });
});

describe("daysUntil / isClosingSoon", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("counts whole days to a future deadline", () => {
    expect(daysUntil("2026-10-11", new Date())).toBe(10);
  });

  it("is negative for a past deadline", () => {
    expect(daysUntil("2026-09-20", new Date())).toBe(-11);
  });

  it("is closing soon exactly at the boundary (30 days)", () => {
    expect(isClosingSoon(make({ deadline: "2026-10-31" }), new Date())).toBe(true);
  });

  it("is not closing soon just past the boundary (31 days)", () => {
    expect(isClosingSoon(make({ deadline: "2026-11-01" }), new Date())).toBe(false);
  });

  it("is not closing soon once the deadline has passed", () => {
    expect(isClosingSoon(make({ deadline: "2026-09-20" }), new Date())).toBe(false);
  });

  it("is never closing soon with no deadline", () => {
    expect(isClosingSoon(make({}), new Date())).toBe(false);
  });

  it("stays closing soon for as long as the listing is open on its deadline day", () => {
    // 1 Oct ends Anywhere on Earth at 2 Oct 12:00 UTC.
    expect(isClosingSoon(make({ deadline: "2026-10-01" }), new Date("2026-10-02T11:59:59Z"))).toBe(true);
    expect(isClosingSoon(make({ deadline: "2026-10-01" }), new Date("2026-10-02T12:00:00Z"))).toBe(false);
  });

  it("is closing soon for an event with no deadline whose date is near", () => {
    expect(isClosingSoon(make({ type: "event", startDate: "2026-10-10" }), new Date())).toBe(true);
  });
});

describe("isClosed / openOpportunities", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("is still open on the deadline day itself", () => {
    expect(isClosed(make({ deadline: "2026-10-01" }), new Date())).toBe(false);
  });

  it("stays open until the deadline day has ended Anywhere on Earth (UTC−12)", () => {
    expect(isClosed(make({ deadline: "2026-09-30" }), new Date("2026-10-01T11:59:59Z"))).toBe(false);
    expect(isClosed(make({ deadline: "2026-09-30" }), new Date("2026-10-01T12:00:00Z"))).toBe(true);
  });

  it("is closed the day after the deadline", () => {
    expect(isClosed(make({ deadline: "2026-09-30" }), new Date())).toBe(true);
  });

  it("never closes with no deadline", () => {
    expect(isClosed(make({}), new Date())).toBe(false);
  });

  it("ignores a job's start and end dates", () => {
    expect(isClosed(make({ startDate: "2026-09-01", endDate: "2026-09-30" }), new Date())).toBe(false);
  });

  it("closes an event with no deadline once its last day has passed", () => {
    expect(isClosed(make({ type: "event", startDate: "2026-09-30" }), new Date())).toBe(true);
    expect(isClosed(make({ type: "event", startDate: "2026-09-29", endDate: "2026-10-01" }), new Date())).toBe(false);
  });

  it("closes an event at its registration deadline, even before the event", () => {
    expect(isClosed(make({ type: "event", deadline: "2026-09-30", startDate: "2026-10-10" }), new Date())).toBe(true);
  });

  it("never closes an event with no dates at all", () => {
    expect(isClosed(make({ type: "event" }), new Date())).toBe(false);
  });

  it("keeps open and undated listings, dropping closed ones", () => {
    const items = [
      make({ slug: "closed", deadline: "2026-09-30" }),
      make({ slug: "open", deadline: "2026-10-01" }),
      make({ slug: "undated" }),
    ];
    expect(openOpportunities(items, new Date()).map((i) => i.slug)).toEqual(["open", "undated"]);
  });
});

describe("closingDate", () => {
  it("is the deadline when there is one", () => {
    expect(closingDate(make({ type: "event", deadline: "2026-10-01", startDate: "2026-10-10" }))).toBe("2026-10-01");
  });

  it("is an event's last day when it has no deadline", () => {
    expect(closingDate(make({ type: "event", startDate: "2026-10-10", endDate: "2026-10-12" }))).toBe("2026-10-12");
    expect(closingDate(make({ type: "event", startDate: "2026-10-10" }))).toBe("2026-10-10");
  });

  it("is undefined for anything else with no deadline", () => {
    expect(closingDate(make({ type: "course", startDate: "2026-10-10" }))).toBeUndefined();
  });
});

describe("formatEventDates", () => {
  it("shows a one-day event's date", () => {
    expect(formatEventDates({ startDate: "2026-10-30" })).toBe("30 Oct 2026");
    expect(formatEventDates({ startDate: "2026-10-30", endDate: "2026-10-30" })).toBe("30 Oct 2026");
  });

  it("shows a multi-day event's first and last days", () => {
    expect(formatEventDates({ startDate: "2026-10-30", endDate: "2026-11-01" })).toBe("30 Oct 2026 – 1 Nov 2026");
  });

  it("is undefined with no date", () => {
    expect(formatEventDates({})).toBeUndefined();
  });
});

describe("formatDate", () => {
  it("renders an ISO date as day month year", () => {
    expect(formatDate("2026-10-30")).toBe("30 Oct 2026");
  });
});

describe("formatLocation", () => {
  it("shows Global for a worldwide listing", () => {
    expect(formatLocation({ locationCountry: "GLOBAL" })).toBe("Global");
  });

  it("shows the country name with no city", () => {
    expect(formatLocation({ locationCountry: "GB" })).toBe("United Kingdom");
  });

  it("shows city and country together", () => {
    expect(formatLocation({ locationCountry: "GB", locationCity: "London" })).toBe("London, United Kingdom");
  });

  it("appends a note when there is one", () => {
    expect(formatLocation({ locationCountry: "GLOBAL", locationNote: "Min. 2hr overlap with US-West" })).toBe(
      "Global · Min. 2hr overlap with US-West",
    );
  });
});

describe("formatCommitment", () => {
  it("maps the stored value to a display label", () => {
    expect(formatCommitment({ commitment: "full_time" })).toBe("Full-time");
  });

  it("is undefined with no commitment", () => {
    expect(formatCommitment({})).toBeUndefined();
  });
});

describe("formatCompensation", () => {
  it("is undefined with no amount or note", () => {
    expect(formatCompensation({})).toBeUndefined();
  });

  it("formats a single amount with currency and period", () => {
    expect(formatCompensation({ compMin: 90_000, compCurrency: "GBP", compPeriod: "year" })).toBe("£90,000/year");
  });

  it("formats a range", () => {
    expect(formatCompensation({ compMin: 100_000, compMax: 125_000, compCurrency: "GBP", compPeriod: "year" })).toBe(
      "£100,000–£125,000/year",
    );
  });

  it("appends a note", () => {
    expect(formatCompensation({ compNote: "Negotiable" })).toBe("Negotiable");
    expect(formatCompensation({ compMin: 1_800, compCurrency: "USD", compPeriod: "week", compNote: "Higher for exceptional candidates" })).toBe(
      "$1,800/week · Higher for exceptional candidates",
    );
  });
});
