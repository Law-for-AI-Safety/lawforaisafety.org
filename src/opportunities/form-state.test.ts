import { describe, expect, it } from "vitest";
import {
  emptyOpportunityForm,
  opportunityFormFromExisting,
  opportunityFormFromSubmission,
  roundForm,
  roundRowsInSavedOrder,
  toOpportunityBody,
} from "./form-state";

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

describe("rolling applications and email apply links in the form", () => {
  it("sends no deadline while rolling, keeping what was typed for if rolling is turned off", () => {
    const rounds = [roundForm({ deadline: "2026-11-15", startDate: "2026-11-23" })];
    const state = { ...emptyOpportunityForm(), rolling: true, deadline: "2026-12-01", rounds };
    expect(toOpportunityBody(state)).toMatchObject({
      rolling: true,
      deadline: null,
      rounds: [{ label: "", deadline: "", startDate: "2026-11-23", endDate: "" }],
    });
    expect(toOpportunityBody({ ...state, rolling: false })).toMatchObject({ rolling: false, deadline: "2026-12-01" });
  });

  it("shows a listing's or a submission's email link as just the address, and its rolling", () => {
    const listing = {
      id: "1",
      slug: "pauseai-volunteer",
      status: "published" as const,
      publishedAt: "2026-11-01",
      type: "project" as const,
      title: "Volunteer",
      org: "PauseAI",
      summary: "",
      description: "",
      locationCountry: "GLOBAL",
      remote: true,
      rolling: true as const,
      applyUrl: "mailto:join@pauseai.info",
    };
    expect(opportunityFormFromExisting(listing)).toMatchObject({ rolling: true, applyUrl: "join@pauseai.info" });
    const submission = {
      type: null,
      title: null,
      org: null,
      applyUrl: "mailto:join@pauseai.info",
      sourceUrl: null,
      location: null,
      remote: false,
      deadline: null,
      rolling: true,
      startDate: null,
      endDate: null,
      description: null,
    };
    expect(opportunityFormFromSubmission(submission)).toMatchObject({ rolling: true, applyUrl: "join@pauseai.info" });
    expect(opportunityFormFromSubmission({ ...submission, applyUrl: null, rolling: false })).toMatchObject({ rolling: false, applyUrl: "" });
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
