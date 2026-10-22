import { afterEach, describe, expect, it } from "vitest";
import { withOpportunities } from "../../test/fakes/opportunities-dir";
import { getOpportunities, getOpportunityBySlug } from "./data";
import type { Opportunity } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whatever's really committed in content/opportunities/ right now - possibly nothing, since the
 * board is admin-managed content, not a fixture that's guaranteed to be non-empty.
 */
describe("the real opportunities directory", () => {
  it("has a unique, URL-safe slug per entry", () => {
    const slugs = getOpportunities().map((o) => o.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("gives every entry the fields a card and detail page need", () => {
    for (const o of getOpportunities()) {
      expect(o.title.trim()).not.toBe("");
      expect(o.org.trim()).not.toBe("");
      expect(o.summary.trim()).not.toBe("");
      expect(o.description.trim()).not.toBe("");
      expect(o.applyUrl).toMatch(/^https:\/\//);
    }
  });

  it("only uses valid ISO dates where a date is given", () => {
    for (const o of getOpportunities()) {
      for (const field of [o.deadline, o.startDate, o.endDate, o.publishedAt]) {
        if (field !== undefined) expect(field).toMatch(ISO_DATE);
      }
    }
  });

  it("matches getOpportunityBySlug for every entry", () => {
    for (const o of getOpportunities()) {
      expect(getOpportunityBySlug(o.slug)).toEqual(o);
    }
  });
});

const FIXTURE: Opportunity = {
  slug: "fixture-job",
  type: "job",
  title: "Fixture Job",
  org: "Fixture Org",
  summary: "A short summary.",
  description: "A longer description.",
  location: "Remote",
  remote: true,
  applyUrl: "https://example.com/apply",
  publishedAt: "2026-01-01",
};

describe("getOpportunities / getOpportunityBySlug", () => {
  let restore: () => void;
  afterEach(() => restore());

  it("reads whatever's in the directory, empty or not", () => {
    restore = withOpportunities([]).restore;
    expect(getOpportunities()).toEqual([]);
  });

  it("finds a known listing", () => {
    restore = withOpportunities([FIXTURE]).restore;
    expect(getOpportunityBySlug(FIXTURE.slug)).toEqual(FIXTURE);
  });

  it("returns null for an unknown slug", () => {
    restore = withOpportunities([FIXTURE]).restore;
    expect(getOpportunityBySlug("no-such-opportunity")).toBeNull();
  });
});
