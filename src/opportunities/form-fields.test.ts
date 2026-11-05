import { describe, expect, it } from "vitest";
import { hasOpportunityFields, opportunityFieldsFromBody, roundsFromBody, statusFromBody } from "./form-fields";

describe("opportunityFieldsFromBody", () => {
  it("refuses a body missing title, org or applyUrl", () => {
    expect(opportunityFieldsFromBody({})).toEqual({ ok: false, error: "Title, organisation and apply URL are required" });
    expect(opportunityFieldsFromBody({ title: "A", org: "B" })).toEqual({ ok: false, error: "Title, organisation and apply URL are required" });
  });

  it("trims strings and drops blank optional fields", () => {
    const result = opportunityFieldsFromBody({ type: "job", title: " A Job ", org: " Acme ", applyUrl: " https://example.com/apply ", orgUrl: "   " });
    expect(result).toMatchObject({ ok: true, fields: { title: "A Job", org: "Acme", applyUrl: "https://example.com/apply", orgUrl: undefined } });
  });

  it("keeps any known type", () => {
    const base = { title: "A", org: "B", applyUrl: "https://example.com" };
    for (const type of ["job", "fellowship", "project", "course", "event"]) {
      expect(opportunityFieldsFromBody({ ...base, type })).toMatchObject({ ok: true, fields: { type } });
    }
  });

  it("rejects a missing or unknown type rather than guessing one", () => {
    const base = { title: "A", org: "B", applyUrl: "https://example.com" };
    const error = "Type must be one of: job, fellowship, project, course, event";
    expect(opportunityFieldsFromBody(base)).toEqual({ ok: false, error });
    expect(opportunityFieldsFromBody({ ...base, type: "Event" })).toEqual({ ok: false, error });
    expect(opportunityFieldsFromBody({ ...base, type: "workshop" })).toEqual({ ok: false, error });
  });

  it("keeps only non-blank string tags", () => {
    const result = opportunityFieldsFromBody({ type: "job", title: "A", org: "B", applyUrl: "https://example.com", tags: ["Remote", "  ", 42, "Policy"] });
    expect(result).toMatchObject({ fields: { tags: ["Remote", "Policy"] } });
  });

  it("leaves tags undefined when not an array", () => {
    const result = opportunityFieldsFromBody({ type: "job", title: "A", org: "B", applyUrl: "https://example.com" });
    expect(result).toMatchObject({ fields: { tags: undefined } });
  });
});

describe("statusFromBody", () => {
  it("leaves the status undefined when the body has none", () => {
    expect(statusFromBody({})).toEqual({ ok: true, status: undefined });
  });

  it("keeps draft or published", () => {
    expect(statusFromBody({ status: "draft" })).toEqual({ ok: true, status: "draft" });
    expect(statusFromBody({ status: "published" })).toEqual({ ok: true, status: "published" });
  });

  it("rejects any other status rather than guessing one", () => {
    const error = "Status must be one of: draft, published";
    expect(statusFromBody({ status: "Draft" })).toEqual({ ok: false, error });
    expect(statusFromBody({ status: true })).toEqual({ ok: false, error });
  });
});

describe("hasOpportunityFields", () => {
  it("is false for a body with only a status and identity", () => {
    expect(hasOpportunityFields({ status: "published", slug: "a", id: "b", publishedAt: "2026-01-01" })).toBe(false);
  });

  it("is true once any editable field is there, even a blank one", () => {
    expect(hasOpportunityFields({ status: "published", title: "" })).toBe(true);
    expect(hasOpportunityFields({ remote: false })).toBe(true);
  });
});

describe("roundsFromBody", () => {
  it("has no rounds when they are left out, null or an empty list", () => {
    for (const value of [undefined, null, []]) expect(roundsFromBody(value)).toEqual({ ok: true, rounds: undefined });
  });

  it("trims each round's values and drops blank or null ones", () => {
    expect(
      roundsFromBody([
        { label: " Intensive ", deadline: "2026-11-15", startDate: "", endDate: null },
        { deadline: " 2026-12-06 " },
        {},
      ]),
    ).toEqual({ ok: true, rounds: [{ label: "Intensive", deadline: "2026-11-15" }, { deadline: "2026-12-06" }, {}] });
  });

  it("refuses anything but a list of objects", () => {
    expect(roundsFromBody({ deadline: "2026-11-15" })).toEqual({
      ok: false,
      error: "Rounds must be a list of rounds, each {label?, deadline?, startDate?, endDate?}",
    });
    expect(roundsFromBody([{ deadline: "2026-11-15" }, "2026-12-06"])).toEqual({
      ok: false,
      error: "Round 2 must be an object: rounds must be a list of rounds, each {label?, deadline?, startDate?, endDate?}",
    });
    expect(roundsFromBody([null])).toMatchObject({ ok: false });
    expect(roundsFromBody([[]])).toMatchObject({ ok: false });
  });

  it("names an unknown field and a value that isn't a string", () => {
    expect(roundsFromBody([{ deadline: "2026-11-15", closes: "2026-11-15" }])).toEqual({
      ok: false,
      error: 'Round 1 has an unknown field "closes": a round takes label, deadline, startDate, endDate',
    });
    expect(roundsFromBody([{ deadline: 20261115 }])).toEqual({ ok: false, error: "Round 1: deadline must be a string" });
  });

  it("is read as one of a body's fields, and its error refuses the body", () => {
    const base = { type: "course", title: "A", org: "B", applyUrl: "https://example.com" };
    expect(hasOpportunityFields({ rounds: [] })).toBe(true);
    expect(opportunityFieldsFromBody({ ...base, rounds: [{ deadline: "2026-11-15" }] })).toMatchObject({
      ok: true,
      fields: { rounds: [{ deadline: "2026-11-15" }] },
    });
    expect(opportunityFieldsFromBody({ ...base, rounds: "soon" })).toMatchObject({ ok: false });
  });
});
