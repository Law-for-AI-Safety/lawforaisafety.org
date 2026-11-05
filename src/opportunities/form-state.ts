import { GLOBAL } from "./schema";
import type { CommitmentType, CompCurrency, CompPeriod, Opportunity, OpportunityRound, OpportunityType } from "./types";

/**
 * The admin opportunity form's state and the conversions in and out of it. Kept apart from the
 * `"use client"` fields component so server pages, such as the new-listing page started from a
 * submission, can build an initial state.
 */

/**
 * One round's row in the form: every field a plain string, blank for unset, and a `key` that
 * stays with the row while others are added or removed. The key is never sent.
 */
export type RoundFormState = Required<Record<keyof OpportunityRound, string>> & { key: number };

let lastRoundKey = 0;

export function roundForm(round: OpportunityRound = {}): RoundFormState {
  return {
    key: ++lastRoundKey,
    label: round.label ?? "",
    deadline: round.deadline ?? "",
    startDate: round.startDate ?? "",
    endDate: round.endDate ?? "",
  };
}

/** The admin form's working state: every field a plain string (or boolean) except tags, a list; comp amounts as text (parsed on submit). */
export type OpportunityFormState = {
  type: OpportunityType;
  title: string;
  org: string;
  orgUrl: string;
  summary: string;
  description: string;
  locationCountry: string;
  locationCity: string;
  locationNote: string;
  remote: boolean;
  commitment: "" | CommitmentType;
  compMin: string;
  compMax: string;
  compCurrency: "" | CompCurrency;
  compPeriod: "" | CompPeriod;
  compNote: string;
  deadline: string;
  startDate: string;
  endDate: string;
  /** Empty for a listing with single dates, which are then in `deadline`, `startDate` and `endDate`. */
  rounds: RoundFormState[];
  tags: string[];
  applyUrl: string;
  applyLabel: string;
  sourceUrl: string;
};

export function emptyOpportunityForm(): OpportunityFormState {
  return {
    type: "job",
    title: "",
    org: "",
    orgUrl: "",
    summary: "",
    description: "",
    locationCountry: "",
    locationCity: "",
    locationNote: "",
    remote: false,
    commitment: "",
    compMin: "",
    compMax: "",
    compCurrency: "",
    compPeriod: "",
    compNote: "",
    deadline: "",
    startDate: "",
    endDate: "",
    rounds: [],
    tags: [],
    applyUrl: "",
    applyLabel: "",
    sourceUrl: "",
  };
}

export function opportunityFormFromExisting(o: Opportunity): OpportunityFormState {
  return {
    type: o.type,
    title: o.title,
    org: o.org,
    orgUrl: o.orgUrl ?? "",
    summary: o.summary,
    description: o.description,
    locationCountry: o.locationCountry,
    locationCity: o.locationCity ?? "",
    locationNote: o.locationNote ?? "",
    remote: o.remote,
    commitment: o.commitment ?? "",
    compMin: o.compMin !== undefined ? String(o.compMin) : "",
    compMax: o.compMax !== undefined ? String(o.compMax) : "",
    compCurrency: o.compCurrency ?? "",
    compPeriod: o.compPeriod ?? "",
    compNote: o.compNote ?? "",
    deadline: o.deadline ?? "",
    startDate: o.startDate ?? "",
    endDate: o.endDate ?? "",
    rounds: (o.rounds ?? []).map(roundForm),
    tags: o.tags ?? [],
    applyUrl: o.applyUrl,
    applyLabel: o.applyLabel ?? "",
    sourceUrl: o.sourceUrl ?? "",
  };
}

/**
 * A new listing's form, started from what an outside submitter sent in. Their free-text
 * location goes in the location note for the admin to turn into a country and city.
 */
export function opportunityFormFromSubmission(submission: {
  type: OpportunityType | null;
  title: string | null;
  org: string | null;
  applyUrl: string | null;
  sourceUrl: string | null;
  location: string | null;
  remote: boolean;
  deadline: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
}): OpportunityFormState {
  return {
    ...emptyOpportunityForm(),
    type: submission.type ?? "job",
    title: submission.title ?? "",
    org: submission.org ?? "",
    applyUrl: submission.applyUrl ?? "",
    sourceUrl: submission.sourceUrl ?? "",
    locationNote: submission.location ?? "",
    remote: submission.remote,
    deadline: submission.deadline ?? "",
    startDate: submission.startDate ?? "",
    endDate: submission.endDate ?? "",
    description: submission.description ?? "",
  };
}

/** The request body the create/update routes expect, from the form's working state. */
export function toOpportunityBody(state: OpportunityFormState): Record<string, unknown> {
  return {
    ...state,
    locationCity: state.locationCountry === GLOBAL ? undefined : state.locationCity.trim() || undefined,
    compMin: state.compMin.trim() || undefined,
    compMax: state.compMax.trim() || undefined,
    rounds: state.rounds.length > 0 ? state.rounds.map(({ label, deadline, startDate, endDate }) => ({ label, deadline, startDate, endDate })) : undefined,
  };
}
