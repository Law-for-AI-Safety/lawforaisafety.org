"use client";

import type { Dispatch, SetStateAction } from "react";
import { COMMITMENT_TYPES, COMP_CURRENCIES, COMP_PERIODS, GLOBAL } from "@/opportunities/schema";
import { COUNTRIES } from "@/opportunities/countries";
import { OPPORTUNITY_KINDS, OPPORTUNITY_TYPES } from "@/opportunities/kinds";
import type { CommitmentType, CompCurrency, CompPeriod, Opportunity, OpportunityType } from "@/opportunities/types";
import CityPicker from "./CityPicker";
import TagPicker from "./TagPicker";

const COMMITMENT_LABEL: Record<CommitmentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  fellowship: "Fellowship",
};
const COMP_PERIOD_LABEL: Record<CompPeriod, string> = { year: "year", month: "month", week: "week", day: "day", hour: "hour" };

/** The admin form's working state: every field a plain string (or boolean), tags as one comma-separated input, comp amounts as text (parsed on submit). */
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
  };
}

const input = "border border-brand-black/30 bg-brand-white px-3 py-2";
const label = "flex flex-col gap-1";
const labelText = "font-sans text-brand-black";

export default function OpportunityFields({
  state,
  setState,
  tagSuggestions = [],
}: {
  state: OpportunityFormState;
  setState: Dispatch<SetStateAction<OpportunityFormState>>;
  tagSuggestions?: string[];
}) {
  const set = <K extends keyof OpportunityFormState>(key: K) => (value: OpportunityFormState[K]) =>
    setState((s) => ({ ...s, [key]: value }));
  const kind = OPPORTUNITY_KINDS[state.type];

  return (
    <div className="flex flex-col gap-4">
      <label className={label}>
        <span className={labelText}>Type</span>
        <select value={state.type} onChange={(e) => set("type")(e.target.value as OpportunityType)} className={input}>
          {OPPORTUNITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {OPPORTUNITY_KINDS[type].label}
            </option>
          ))}
        </select>
      </label>

      <label className={label}>
        <span className={labelText}>Title</span>
        <input required value={state.title} onChange={(e) => set("title")(e.target.value)} className={input} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          <span className={labelText}>Organisation</span>
          <input required value={state.org} onChange={(e) => set("org")(e.target.value)} className={input} />
        </label>
        <label className={label}>
          <span className={labelText}>Organisation URL</span>
          <input value={state.orgUrl} onChange={(e) => set("orgUrl")(e.target.value)} className={input} />
        </label>
      </div>

      <label className={label}>
        <span className={labelText}>Summary (1-2 sentences, for the card)</span>
        <textarea required rows={2} value={state.summary} onChange={(e) => set("summary")(e.target.value)} className={input} />
      </label>

      <label className={label}>
        <span className={labelText}>Description (full body, paragraphs separated by a blank line)</span>
        <textarea required rows={6} value={state.description} onChange={(e) => set("description")(e.target.value)} className={input} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          <span className={labelText}>Country</span>
          <select
            required
            value={state.locationCountry}
            onChange={(e) => setState((s) => ({ ...s, locationCountry: e.target.value, locationCity: "" }))}
            className={input}
          >
            <option value="" disabled>
              Select a country…
            </option>
            <option value={GLOBAL}>Global</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {state.locationCountry && state.locationCountry !== GLOBAL && (
          <label className={label}>
            <span className={labelText}>City</span>
            <CityPicker value={state.locationCity} onChange={set("locationCity")} country={state.locationCountry} className={input} />
          </label>
        )}
        <label className="flex items-center gap-2 pt-6">
          <input type="checkbox" checked={state.remote} onChange={(e) => set("remote")(e.target.checked)} />
          <span className={labelText}>Remote</span>
        </label>
      </div>

      <label className={label}>
        <span className={labelText}>Location note (caveats, e.g. required time-zone overlap or an in-person onboarding trip)</span>
        <input value={state.locationNote} onChange={(e) => set("locationNote")(e.target.value)} className={input} />
      </label>

      <label className={label}>
        <span className={labelText}>Commitment</span>
        <select
          value={state.commitment}
          onChange={(e) => set("commitment")(e.target.value as OpportunityFormState["commitment"])}
          className={input}
        >
          <option value="">—</option>
          {COMMITMENT_TYPES.map((c) => (
            <option key={c} value={c}>
              {COMMITMENT_LABEL[c]}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-4">
        <label className={label}>
          <span className={labelText}>Compensation min</span>
          <input type="number" min="0" value={state.compMin} onChange={(e) => set("compMin")(e.target.value)} className={input} />
        </label>
        <label className={label}>
          <span className={labelText}>Compensation max</span>
          <input type="number" min="0" value={state.compMax} onChange={(e) => set("compMax")(e.target.value)} className={input} />
        </label>
        <label className={label}>
          <span className={labelText}>Currency</span>
          <select
            value={state.compCurrency}
            onChange={(e) => set("compCurrency")(e.target.value as OpportunityFormState["compCurrency"])}
            className={input}
          >
            <option value="">—</option>
            {COMP_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span className={labelText}>Per</span>
          <select
            value={state.compPeriod}
            onChange={(e) => set("compPeriod")(e.target.value as OpportunityFormState["compPeriod"])}
            className={input}
          >
            <option value="">—</option>
            {COMP_PERIODS.map((p) => (
              <option key={p} value={p}>
                {COMP_PERIOD_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className={label}>
        <span className={labelText}>Compensation note (caveats that don&apos;t fit the range, e.g. location-based)</span>
        <input value={state.compNote} onChange={(e) => set("compNote")(e.target.value)} className={input} />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className={label}>
          <span className={labelText}>{kind.deadlineLabel}</span>
          <input type="date" value={state.deadline} onChange={(e) => set("deadline")(e.target.value)} className={input} />
        </label>
        <label className={label}>
          <span className={labelText}>{kind.startLabel}</span>
          <input type="date" value={state.startDate} onChange={(e) => set("startDate")(e.target.value)} className={input} />
        </label>
        <label className={label}>
          <span className={labelText}>{kind.endLabel}</span>
          <input type="date" value={state.endDate} onChange={(e) => set("endDate")(e.target.value)} className={input} />
        </label>
      </div>

      <TagPicker value={state.tags} onChange={set("tags")} suggestions={tagSuggestions} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          <span className={labelText}>Apply URL</span>
          <input required type="url" value={state.applyUrl} onChange={(e) => set("applyUrl")(e.target.value)} className={input} />
        </label>
        <label className={label}>
          <span className={labelText}>Apply label</span>
          <input value={state.applyLabel} onChange={(e) => set("applyLabel")(e.target.value)} className={input} placeholder={kind.applyLabel} />
        </label>
      </div>

      <label className={label}>
        <span className={labelText}>Source URL (where this was imported from, if different from the apply URL)</span>
        <input type="url" value={state.sourceUrl} onChange={(e) => set("sourceUrl")(e.target.value)} className={input} />
      </label>
    </div>
  );
}
