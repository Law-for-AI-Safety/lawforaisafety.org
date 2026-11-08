import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closingDate,
  currentRun,
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
  locationOptions,
  openOpportunities,
  parseFilters,
  isRunClosingSoon,
  roundsByClosing,
  serializeFilters,
  sortOpportunities,
  sortRounds,
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
    status: "published",
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
    expect(parse("type=job,fellowship&location=GB,FR,global&soon=1&sort=newest")).toEqual({
      types: ["job", "fellowship"],
      countries: ["FR", "GB"],
      global: true,
      closingSoon: true,
      sort: "newest",
    });
  });

  it("orders by closing date unless the query asks for a known order", () => {
    expect(parse("sort=closing").sort).toBe("closing");
    expect(parse("sort=oldest").sort).toBe("closing");
    expect(parse("sort=").sort).toBe("closing");
  });

  it("drops unknown types and keeps the board's order without repeats", () => {
    expect(parse("type=event,nonsense,job,event").types).toEqual(["job", "event"]);
  });

  it("accepts lower-case country codes, once each", () => {
    expect(parse("location=gb,GB").countries).toEqual(["GB"]);
  });

  it("ignores unknown locations", () => {
    expect(parse("location=XX,constructor,,globe")).toEqual(DEFAULT_FILTERS);
  });

  it("reads global and remote in any case, never as a country", () => {
    expect(parse("location=GLOBAL")).toEqual({ ...DEFAULT_FILTERS, global: true });
    expect(parse("location=Global,gb")).toEqual({ ...DEFAULT_FILTERS, countries: ["GB"], global: true });
  });

  it("ignores other values for closing soon", () => {
    expect(parse("soon=true")).toEqual(DEFAULT_FILTERS);
  });
});

describe("serializeFilters", () => {
  it("gives an empty query for the defaults", () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe("");
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
  });

  it("writes every filter in a stable order", () => {
    const filters = {
      types: ["event" as const, "job" as const],
      countries: ["US", "GB"],
      global: true,
      closingSoon: true,
      sort: "newest" as const,
    };
    const query = serializeFilters(filters);
    expect(query).toBe("type=job,event&location=GB,US,global&soon=1&sort=newest");
    expect(parseFilters(new URLSearchParams(query))).toEqual({
      types: ["job", "event"],
      countries: ["GB", "US"],
      global: true,
      closingSoon: true,
      sort: "newest",
    });
  });

  it("counts any one filter as active", () => {
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, types: ["course"] })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, countries: ["FR"] })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, global: true })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, closingSoon: true })).toBe(true);
  });

  it("leaves the default order out of the query, and does not count an order as a filter", () => {
    expect(serializeFilters({ ...DEFAULT_FILTERS, sort: "closing" })).toBe("");
    expect(serializeFilters({ ...DEFAULT_FILTERS, sort: "newest" })).toBe("sort=newest");
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sort: "newest" })).toBe(false);
  });
});

describe("filterOpportunities", () => {
  const now = new Date("2026-10-31T12:00:00Z");
  const items = [
    make({ slug: "gb-office", type: "job", locationCountry: "GB", remote: false }),
    make({ slug: "gb-remote", type: "fellowship", locationCountry: "GB", remote: true }),
    make({ slug: "fr-office", type: "course", locationCountry: "FR", remote: false, deadline: "2026-11-10" }),
    make({ slug: "global", type: "event", locationCountry: "GLOBAL", remote: false }),
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

  it("keeps listings based in the chosen countries, remote or not", () => {
    expect(slugs({ countries: ["GB"] })).toEqual(["gb-office", "gb-remote"]);
    expect(slugs({ countries: ["GB", "FR"] })).toEqual(["gb-office", "gb-remote", "fr-office"]);
  });

  it("keeps remote and global listings for global and remote", () => {
    expect(slugs({ global: true })).toEqual(["gb-remote", "global", "us-remote"]);
  });

  it("adds global and remote listings to the chosen countries", () => {
    expect(slugs({ countries: ["FR"], global: true })).toEqual(["gb-remote", "fr-office", "global", "us-remote"]);
  });

  it("keeps only listings closing soon", () => {
    expect(slugs({ closingSoon: true })).toEqual(["fr-office"]);
  });

  it("combines filters", () => {
    expect(slugs({ types: ["job", "fellowship"], countries: ["GB"], closingSoon: false })).toEqual(["gb-office", "gb-remote"]);
  });
});

describe("locationOptions", () => {
  const items = [
    make({ locationCountry: "US", remote: false }),
    make({ locationCountry: "GB", remote: true }),
    make({ locationCountry: "GLOBAL", remote: false }),
    make({ locationCountry: "GB", remote: false }),
  ];

  it("counts global and remote listings, and lists the countries listings are based in, by name", () => {
    expect(locationOptions(items)).toEqual({
      globalCount: 2,
      countries: [
        { code: "GB", name: "United Kingdom", count: 2 },
        { code: "US", name: "United States", count: 1 },
      ],
    });
  });

  it("still offers selected countries with no listings", () => {
    expect(locationOptions(items, ["FR"]).countries[0]).toEqual({ code: "FR", name: "France", count: 0 });
  });

  it("falls back to the code for a country it has no name for", () => {
    expect(locationOptions([make({ locationCountry: "ZZ", remote: false })]).countries).toEqual([
      { code: "ZZ", name: "ZZ", count: 1 },
    ]);
  });
});

describe("sortOpportunities", () => {
  const NOW = new Date("2026-10-01T12:00:00Z");

  it("orders by soonest deadline first", () => {
    const items = [
      make({ slug: "later", deadline: "2026-12-01" }),
      make({ slug: "soon", deadline: "2026-11-01" }),
    ];
    expect(sortOpportunities(items, "closing", NOW).map((i) => i.slug)).toEqual(["soon", "later"]);
  });

  it("orders an event with no deadline by its date", () => {
    const items = [
      make({ slug: "later", deadline: "2026-12-01" }),
      make({ slug: "event", type: "event", startDate: "2026-11-01" }),
    ];
    expect(sortOpportunities(items, "closing", NOW).map((i) => i.slug)).toEqual(["event", "later"]);
  });

  it("puts undated items after dated ones", () => {
    const items = [make({ slug: "undated" }), make({ slug: "dated", deadline: "2026-11-01" })];
    expect(sortOpportunities(items, "closing", NOW).map((i) => i.slug)).toEqual(["dated", "undated"]);
  });

  it("breaks undated ties by most recently published first", () => {
    const items = [
      make({ slug: "older", publishedAt: "2026-01-01" }),
      make({ slug: "newer", publishedAt: "2026-06-01" }),
    ];
    expect(sortOpportunities(items, "closing", NOW).map((i) => i.slug)).toEqual(["newer", "older"]);
  });

  it("orders by most recently published first when asked for the newest, whatever the deadlines", () => {
    const items = [
      make({ slug: "old-soon", publishedAt: "2026-01-01", deadline: "2026-11-01" }),
      make({ slug: "new-undated", publishedAt: "2026-09-01" }),
      make({ slug: "mid-later", publishedAt: "2026-05-01", deadline: "2026-12-01" }),
    ];
    expect(sortOpportunities(items, "newest", NOW).map((i) => i.slug)).toEqual(["new-undated", "mid-later", "old-soon"]);
    expect(sortOpportunities(items, "closing", NOW).map((i) => i.slug)).toEqual(["old-soon", "mid-later", "new-undated"]);
  });

  it("orders a listing with rounds by its next open round, not a past or later one", () => {
    const items = [
      make({ slug: "single", deadline: "2026-11-01" }),
      make({
        slug: "rounds",
        type: "course",
        rounds: [{ deadline: "2026-09-01" }, { deadline: "2026-10-15" }, { deadline: "2026-12-01" }],
      }),
    ];
    expect(sortOpportunities(items, "closing", NOW).map((i) => i.slug)).toEqual(["rounds", "single"]);
    expect(sortOpportunities(items, "closing", new Date("2026-10-20T12:00:00Z")).map((i) => i.slug)).toEqual([
      "single",
      "rounds",
    ]);
  });

  it("does not mutate the input array", () => {
    const items = [make({ slug: "a", deadline: "2026-12-01" }), make({ slug: "b", deadline: "2026-01-01" })];
    const copy = [...items];
    sortOpportunities(items, "closing", NOW);
    sortOpportunities(items, "newest", NOW);
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

describe("listings with rounds", () => {
  const course = make({
    type: "course",
    rounds: [
      { label: "Round 2", deadline: "2026-12-06", startDate: "2026-12-14", endDate: "2027-02-07" },
      { label: "Round 1", deadline: "2026-11-15", startDate: "2026-11-23", endDate: "2027-01-17" },
      { label: "Round 3", deadline: "2026-12-27", startDate: "2027-01-04", endDate: "2027-02-28" },
    ],
  });
  const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

  it("lists rounds soonest closing first, each marked closed or not, keeping where each was entered", () => {
    expect(roundsByClosing(course, at("2026-11-20")).map(({ round, index, closed }) => [round.label, index, closed])).toEqual([
      ["Round 1", 1, true],
      ["Round 2", 0, false],
      ["Round 3", 2, false],
    ]);
  });

  it("puts a round that never closes last, and keeps the entered order between ties", () => {
    const job = make({ rounds: [{ label: "b", endDate: "2026-12-01" }, { label: "a", deadline: "2026-12-01" }, { label: "c", deadline: "2026-12-01" }] });
    expect(roundsByClosing(job, at("2026-10-01")).map((view) => [view.round.label, view.closes, view.closed])).toEqual([
      ["a", "2026-12-01", false],
      ["c", "2026-12-01", false],
      ["b", undefined, false],
    ]);
  });

  it("puts rounds in the order they close, as they are saved", () => {
    expect(sortRounds("course", course.rounds!).map((round) => round.label)).toEqual(["Round 1", "Round 2", "Round 3"]);
    expect(sortRounds("job", [{ endDate: "2026-01-01" }, { deadline: "2026-12-01" }])).toEqual([
      { deadline: "2026-12-01" },
      { endDate: "2026-01-01" },
    ]);
  });

  it("has no rounds for a listing with single dates", () => {
    expect(roundsByClosing(make({ deadline: "2026-12-01" }), at("2026-10-01"))).toEqual([]);
  });

  it("goes by the first round, with the others still to come, before any has closed", () => {
    expect(currentRun(course, at("2026-10-01"))).toMatchObject({
      deadline: "2026-11-15",
      startDate: "2026-11-23",
      endDate: "2027-01-17",
      round: { index: 1 },
      moreRounds: 2,
    });
    expect(isClosed(course, at("2026-10-01"))).toBe(false);
    expect(isClosingSoon(course, at("2026-10-01"))).toBe(false);
  });

  it("moves on to the next round once one has closed, Anywhere on Earth", () => {
    // 15 Nov ends Anywhere on Earth at 16 Nov 12:00 UTC.
    expect(currentRun(course, new Date("2026-11-16T11:59:59Z")).deadline).toBe("2026-11-15");
    expect(currentRun(course, new Date("2026-11-16T12:00:00Z"))).toMatchObject({ deadline: "2026-12-06", moreRounds: 1 });
    expect(isClosingSoon(course, at("2026-11-20"))).toBe(true);
  });

  it("stays open until its last round has closed, then shows that round", () => {
    expect(isClosed(course, at("2026-12-27"))).toBe(false);
    expect(currentRun(course, at("2026-12-28"))).toMatchObject({ deadline: "2026-12-27", round: { index: 2 }, moreRounds: 0 });
    expect(isClosed(course, at("2026-12-28"))).toBe(true);
    expect(openOpportunities([course], at("2026-12-28"))).toEqual([]);
  });

  it("closes a course round with no deadline after it starts, and an event round after its last day", () => {
    const undated = make({ type: "course", rounds: [{ startDate: "2026-10-05" }, { startDate: "2026-11-05" }] });
    expect(currentRun(undated, at("2026-10-06")).startDate).toBe("2026-11-05");
    const event = make({ type: "event", rounds: [{ startDate: "2026-10-05", endDate: "2026-10-07" }] });
    expect(isClosed(event, at("2026-10-07"))).toBe(false);
    expect(isClosed(event, at("2026-10-08"))).toBe(true);
  });

  it("closes any round with no deadline once it starts, so a past round isn't shown as next", () => {
    const fellowship = make({ type: "fellowship", rounds: [{ startDate: "2026-01-10" }, { startDate: "2027-03-01" }] });
    expect(currentRun(fellowship, at("2026-10-01"))).toMatchObject({ startDate: "2027-03-01", closes: "2027-03-01", moreRounds: 0 });
    expect(roundsByClosing(fellowship, at("2026-10-01")).map((view) => view.closed)).toEqual([true, false]);
    expect(isClosed(fellowship, at("2027-03-02"))).toBe(true);
  });

  it("never closes while one of its rounds has no closing date", () => {
    const job = make({ rounds: [{ deadline: "2026-09-01" }, { endDate: "2026-09-01" }] });
    expect(isClosed(job, at("2026-10-01"))).toBe(false);
    expect(currentRun(job, at("2026-10-01"))).toMatchObject({ endDate: "2026-09-01", closes: undefined, moreRounds: 0 });
  });

  it("says when the run closes, and whether that is soon, from one currentRun", () => {
    const run = currentRun(course, at("2026-11-01"));
    expect(run.closes).toBe("2026-11-15");
    expect(isRunClosingSoon(run, at("2026-11-01"))).toBe(true);
    expect(isRunClosingSoon(run, at("2026-11-01"), 7)).toBe(false);
    expect(isRunClosingSoon({ closes: undefined }, at("2026-11-01"))).toBe(false);
  });

  it("goes by a listing's own dates when it has no rounds", () => {
    expect(currentRun(make({ deadline: "2026-12-01", startDate: "2027-01-01" }), at("2026-10-01"))).toEqual({
      deadline: "2026-12-01",
      startDate: "2027-01-01",
      endDate: undefined,
      closes: "2026-12-01",
      moreRounds: 0,
    });
  });
});

describe("closingDate", () => {
  const NOW = new Date("2026-10-01T12:00:00Z");

  it("is the deadline when there is one", () => {
    expect(closingDate(make({ type: "event", deadline: "2026-10-01", startDate: "2026-10-10" }), NOW)).toBe("2026-10-01");
  });

  it("is an event's last day when it has no deadline", () => {
    expect(closingDate(make({ type: "event", startDate: "2026-10-10", endDate: "2026-10-12" }), NOW)).toBe("2026-10-12");
    expect(closingDate(make({ type: "event", startDate: "2026-10-10" }), NOW)).toBe("2026-10-10");
  });

  it("is a course's start date when it has no deadline", () => {
    expect(closingDate(make({ type: "course", startDate: "2026-10-10", endDate: "2026-12-01" }), NOW)).toBe("2026-10-10");
  });

  it("is undefined for anything else with no deadline", () => {
    expect(closingDate(make({ type: "fellowship", startDate: "2026-10-10" }), NOW)).toBeUndefined();
    expect(closingDate(make({ type: "course", endDate: "2026-12-01" }), NOW)).toBeUndefined();
  });

  it("is the next open round's, and the last round's once every round has closed", () => {
    const course = make({ type: "course", rounds: [{ deadline: "2026-11-15" }, { deadline: "2026-09-15" }] });
    expect(closingDate(course, NOW)).toBe("2026-11-15");
    expect(closingDate(course, new Date("2027-01-01T12:00:00Z"))).toBe("2026-11-15");
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
