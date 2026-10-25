import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closingDate,
  daysUntil,
  filterOpportunities,
  formatCommitment,
  formatCompensation,
  formatDate,
  formatEventDates,
  formatLocation,
  isClosed,
  isClosingSoon,
  openOpportunities,
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

describe("filterOpportunities", () => {
  const items = [make({ slug: "a", type: "job" }), make({ slug: "b", type: "course" })];

  it("returns everything for 'all'", () => {
    expect(filterOpportunities(items, "all")).toEqual(items);
  });

  it("returns only jobs for 'job'", () => {
    expect(filterOpportunities(items, "job").map((i) => i.slug)).toEqual(["a"]);
  });

  it("returns only courses for 'course'", () => {
    expect(filterOpportunities(items, "course").map((i) => i.slug)).toEqual(["b"]);
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
    expect(isClosingSoon("2026-10-31", new Date())).toBe(true);
  });

  it("is not closing soon just past the boundary (31 days)", () => {
    expect(isClosingSoon("2026-11-01", new Date())).toBe(false);
  });

  it("is not closing soon once the deadline has passed", () => {
    expect(isClosingSoon("2026-09-20", new Date())).toBe(false);
  });

  it("is never closing soon with no deadline", () => {
    expect(isClosingSoon(undefined, new Date())).toBe(false);
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
