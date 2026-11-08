import { describe, expect, it } from "vitest";
import { emptyOpportunityForm, roundForm, roundRowsInSavedOrder, toOpportunityBody } from "./form-state";

describe("toOpportunityBody", () => {
  it("sends cleared fields as null, so an update clears them rather than keeping them", () => {
    const body = toOpportunityBody({ ...emptyOpportunityForm(), locationCountry: "GB" });
    expect(body).toMatchObject({ locationCity: null, compMin: null, compMax: null, rounds: null });
    expect(JSON.parse(JSON.stringify(body))).toHaveProperty("rounds", null);
  });

  it("leaves out rounds with nothing filled in", () => {
    const rounds = [roundForm({ deadline: "2026-11-15" }), roundForm(), roundForm({ label: " Part-time " })];
    expect(toOpportunityBody({ ...emptyOpportunityForm(), rounds }).rounds).toEqual([
      { label: "", deadline: "2026-11-15", startDate: "", endDate: "" },
      { label: " Part-time ", deadline: "", startDate: "", endDate: "" },
    ]);
  });
});

describe("roundRowsInSavedOrder", () => {
  it("puts the rows in the saved order, each keeping its key", () => {
    const later = roundForm({ label: "Later ", deadline: "2026-12-06" });
    const sooner = roundForm({ deadline: "2026-11-15" });
    const blank = roundForm();
    const rows = roundRowsInSavedOrder([later, blank, sooner], [{ deadline: "2026-11-15" }, { label: "Later", deadline: "2026-12-06" }]);
    expect(rows).toEqual([sooner, later]);
  });

  it("matches identical rounds one row each, and makes a row for a round it can't match", () => {
    const a = roundForm({ deadline: "2026-11-15" });
    const b = roundForm({ deadline: "2026-11-15" });
    const rows = roundRowsInSavedOrder([a, b], [{ deadline: "2026-11-15" }, { deadline: "2026-11-15" }, { startDate: "2027-01-04" }]);
    expect(rows.slice(0, 2)).toEqual([a, b]);
    expect(rows[2]).toMatchObject({ startDate: "2027-01-04", deadline: "" });
    expect(rows[2].key).not.toBe(a.key);
  });
});
