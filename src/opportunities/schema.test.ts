import { describe, expect, it } from "vitest";
import { describeIssues, MAX_ROUNDS, opportunityFieldsSchema, opportunitySchema, parseOpportunity } from "./schema";

function valid() {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    slug: "test-job",
    type: "job" as const,
    title: "Test Job",
    org: "Test org",
    summary: "A short summary.",
    description: "A longer description.",
    locationCountry: "GLOBAL",
    remote: true,
    applyUrl: "https://example.com/apply",
    status: "published" as const,
    publishedAt: "2026-01-01",
  };
}

function withoutPublishedAt(): Record<string, unknown> {
  const value: Record<string, unknown> = valid();
  delete value.publishedAt;
  return value;
}

describe("opportunitySchema", () => {
  it("accepts a minimal valid job", () => {
    expect(parseOpportunity(valid())).toEqual(valid());
  });

  it("accepts every optional field filled in", () => {
    const full = {
      ...valid(),
      locationCountry: "GB",
      locationCity: "London",
      locationNote: "Min. 2hr overlap with US-West",
      orgUrl: "https://example.com",
      commitment: "full_time" as const,
      compMin: 90_000,
      compMax: 110_000,
      compCurrency: "USD" as const,
      compPeriod: "year" as const,
      compNote: "Negotiable for exceptional candidates",
      deadline: "2026-02-01",
      startDate: "2026-03-01",
      endDate: "2026-06-01",
      tags: ["Tag"],
      applyLabel: "Apply now",
      sourceUrl: "https://example.com/original-posting",
    };
    expect(parseOpportunity(full)).toEqual(full);
  });

  it("rejects an unknown key", () => {
    expect(opportunitySchema.safeParse({ ...valid(), extra: true }).success).toBe(false);
  });

  it("rejects a bad slug", () => {
    expect(opportunitySchema.safeParse({ ...valid(), slug: "Not Valid" }).success).toBe(false);
  });

  it("rejects a non-ISO date", () => {
    expect(opportunitySchema.safeParse({ ...valid(), deadline: "1 Feb 2026" }).success).toBe(false);
  });

  it("rejects a date that doesn't exist on the calendar", () => {
    expect(opportunitySchema.safeParse({ ...valid(), deadline: "2024-02-30" }).success).toBe(false);
  });

  it("accepts a real leap day", () => {
    expect(opportunitySchema.safeParse({ ...valid(), deadline: "2024-02-29" }).success).toBe(true);
  });

  it("rejects a non-URL applyUrl", () => {
    expect(opportunitySchema.safeParse({ ...valid(), applyUrl: "not a url" }).success).toBe(false);
  });

  it("rejects an empty required field", () => {
    expect(opportunitySchema.safeParse({ ...valid(), title: "" }).success).toBe(false);
  });

  it("rejects an unknown type", () => {
    expect(opportunitySchema.safeParse({ ...valid(), type: "internship" }).success).toBe(false);
  });

  it("rejects a compensation amount with no currency or period", () => {
    expect(opportunitySchema.safeParse({ ...valid(), compMin: 50_000 }).success).toBe(false);
  });

  it("rejects a compensation max below the min", () => {
    expect(
      opportunitySchema.safeParse({ ...valid(), compMin: 100_000, compMax: 50_000, compCurrency: "GBP", compPeriod: "year" }).success,
    ).toBe(false);
  });

  it("accepts a compensation amount with currency and period", () => {
    expect(
      opportunitySchema.safeParse({ ...valid(), compMin: 50_000, compCurrency: "GBP", compPeriod: "year" }).success,
    ).toBe(true);
  });

  it("rejects an unknown country code", () => {
    expect(opportunitySchema.safeParse({ ...valid(), locationCountry: "ZZ" }).success).toBe(false);
  });

  it("accepts a real country code", () => {
    expect(opportunitySchema.safeParse({ ...valid(), locationCountry: "GB" }).success).toBe(true);
  });

  it("rejects a city on a Global listing", () => {
    expect(opportunitySchema.safeParse({ ...valid(), locationCountry: "GLOBAL", locationCity: "London" }).success).toBe(false);
  });

  it("rejects an event with no date", () => {
    const result = opportunitySchema.safeParse({ ...valid(), type: "event", deadline: "2026-11-01" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("An event needs its date (start date)");
  });

  it("accepts an event with a date", () => {
    expect(opportunitySchema.safeParse({ ...valid(), type: "event", startDate: "2026-11-20" }).success).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    const result = opportunitySchema.safeParse({ ...valid(), startDate: "2026-11-05", endDate: "2026-11-01" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("End date can't be before the start date");
  });

  it("accepts an end date on the start date", () => {
    expect(opportunitySchema.safeParse({ ...valid(), startDate: "2026-11-05", endDate: "2026-11-05" }).success).toBe(true);
  });

  it("accepts a draft with no published date", () => {
    expect(opportunitySchema.safeParse({ ...withoutPublishedAt(), status: "draft" }).success).toBe(true);
  });

  it("rejects a draft that already has a published date", () => {
    const result = opportunitySchema.safeParse({ ...valid(), status: "draft" });
    expect(result.error?.issues[0]?.message).toBe("A draft has no published date until it is published");
  });

  it("rejects a published listing with no published date", () => {
    const result = opportunitySchema.safeParse(withoutPublishedAt());
    expect(result.error?.issues[0]?.message).toBe("A published listing needs its published date");
  });

  it("rejects an unknown status", () => {
    expect(opportunitySchema.safeParse({ ...valid(), status: "archived" }).success).toBe(false);
  });
});

describe("rounds", () => {
  const issues = (value: unknown) => {
    const result = opportunitySchema.safeParse(value);
    return result.success ? "" : describeIssues(result.error);
  };
  const course = () => ({
    ...valid(),
    type: "course" as const,
    rounds: [
      { label: "Intensive", deadline: "2026-11-15", startDate: "2026-11-23", endDate: "2026-12-18" },
      { deadline: "2026-12-06" },
    ],
  });

  it("accepts a listing with rounds, each with a label or not", () => {
    expect(parseOpportunity(course())).toEqual(course());
  });

  it("accepts a round with only one of its dates", () => {
    expect(issues({ ...valid(), rounds: [{ startDate: "2027-01-04" }, { endDate: "2027-02-01" }] })).toBe("");
  });

  it("names the round a problem is in, counting from 1", () => {
    expect(issues({ ...course(), rounds: [{ deadline: "2026-11-15" }, { deadline: "15/11/2026" }] })).toBe(
      "Round 2: Deadline must be an ISO date (YYYY-MM-DD)",
    );
  });

  it("rejects a round with no dates", () => {
    expect(issues({ ...course(), rounds: [{ label: "Part-time" }] })).toBe("Round 1: A round needs at least one date");
  });

  it("rejects a round that ends before it starts", () => {
    expect(issues({ ...course(), rounds: [{ startDate: "2026-12-01", endDate: "2026-11-01" }] })).toBe(
      "Round 1: End date can't be before the start date",
    );
  });

  it("rejects an event round with no date of its own", () => {
    expect(issues({ ...valid(), type: "event", rounds: [{ startDate: "2026-12-01" }, { deadline: "2026-12-01" }] })).toBe(
      "Round 2: An event's round needs its date (start date)",
    );
  });

  it("gives an event round with no dates at all one error, not two", () => {
    expect(issues({ ...valid(), type: "event", rounds: [{ startDate: "2026-12-01" }, { label: "Day 2" }] })).toBe(
      "Round 2: An event's round needs its date (start date)",
    );
  });

  it("takes an event's date from its rounds, so needs none of its own", () => {
    expect(issues({ ...valid(), type: "event", rounds: [{ startDate: "2026-12-01" }] })).toBe("");
  });

  it("rejects the listing's own dates alongside rounds", () => {
    for (const key of ["deadline", "startDate", "endDate"]) {
      expect(issues({ ...course(), [key]: "2026-11-01" })).toBe(
        "A listing with rounds keeps its dates in its rounds: leave its own deadline, start date and end date blank",
      );
    }
  });

  it("rejects an unknown key or a too-long label in a round", () => {
    expect(issues({ ...course(), rounds: [{ deadline: "2026-11-01", cohort: "A" }] })).toMatch(/^Round 1: Unrecognized key/);
    expect(issues({ ...course(), rounds: [{ deadline: "2026-11-01", label: "x".repeat(51) }] })).toBe("Round 1: Label is too long");
  });

  it("rejects an empty list of rounds, and more than the most allowed", () => {
    expect(issues({ ...course(), rounds: [] })).toBe("Rounds can't be an empty list: leave them out for a listing with single dates");
    const many = Array.from({ length: MAX_ROUNDS + 1 }, () => ({ deadline: "2026-11-01" }));
    expect(issues({ ...course(), rounds: many })).toBe(`A listing can have at most ${MAX_ROUNDS} rounds`);
  });

  it("checks rounds in the editable fields too", () => {
    const fields: Record<string, unknown> = course();
    for (const key of ["id", "slug", "status", "publishedAt"]) delete fields[key];
    expect(opportunityFieldsSchema.safeParse({ ...fields, rounds: [{}] }).success).toBe(false);
    expect(opportunityFieldsSchema.safeParse(fields).success).toBe(true);
  });
});

describe("rolling applications", () => {
  it("takes a listing with rolling applications and no deadline, its rounds' included", () => {
    expect(parseOpportunity({ ...valid(), rolling: true })).toMatchObject({ rolling: true });
    const course = { ...valid(), type: "course" as const, rolling: true, rounds: [{ startDate: "2027-01-10" }, { startDate: "2027-04-10" }] };
    expect(parseOpportunity(course).rounds).toHaveLength(2);
  });

  it("refuses a deadline on a rolling listing, its own or a round's, naming where", () => {
    const own = opportunitySchema.safeParse({ ...valid(), rolling: true, deadline: "2026-12-01" });
    expect(own.success || own.error.issues.map((issue) => issue.path)).toEqual([["deadline"]]);
    const round = opportunitySchema.safeParse({ ...valid(), rolling: true, rounds: [{ startDate: "2027-01-10" }, { deadline: "2027-03-01" }] });
    expect(round.success || describeIssues(round.error)).toBe(
      "Round 2: A listing with rolling applications has no deadline: leave the deadline blank, or turn rolling off",
    );
  });

  it("takes rolling only as true", () => {
    expect(opportunitySchema.safeParse({ ...valid(), rolling: false }).success).toBe(false);
    expect(opportunitySchema.safeParse({ ...valid(), rolling: "yes" }).success).toBe(false);
  });
});

describe("apply link", () => {
  it("takes a web address or a mailto: link to one email address", () => {
    expect(parseOpportunity({ ...valid(), applyUrl: "mailto:join@pauseai.info" }).applyUrl).toBe("mailto:join@pauseai.info");
    for (const applyUrl of ["join@pauseai.info", "javascript:alert(1)", "mailto:a@b.org?subject=Hi"]) {
      const result = opportunitySchema.safeParse({ ...valid(), applyUrl });
      expect(result.success || describeIssues(result.error)).toBe(
        "Apply link must be a web address (http:// or https://) or an email address",
      );
    }
  });
});
