"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Opportunity } from "@/opportunities/types";

/** The admin form's working state: every field a plain string (or boolean), tags as one comma-separated input. */
export type OpportunityFormState = {
  type: "job" | "course";
  title: string;
  org: string;
  orgUrl: string;
  summary: string;
  description: string;
  location: string;
  remote: boolean;
  commitment: string;
  compensation: string;
  deadline: string;
  startDate: string;
  endDate: string;
  tagsText: string;
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
    location: "",
    remote: false,
    commitment: "",
    compensation: "",
    deadline: "",
    startDate: "",
    endDate: "",
    tagsText: "",
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
    location: o.location,
    remote: o.remote,
    commitment: o.commitment ?? "",
    compensation: o.compensation ?? "",
    deadline: o.deadline ?? "",
    startDate: o.startDate ?? "",
    endDate: o.endDate ?? "",
    tagsText: (o.tags ?? []).join(", "),
    applyUrl: o.applyUrl,
    applyLabel: o.applyLabel ?? "",
    sourceUrl: o.sourceUrl ?? "",
  };
}

/** The request body the create/update routes expect, from the form's working state. */
export function toOpportunityBody(state: OpportunityFormState): Record<string, unknown> {
  return {
    ...state,
    tags: state.tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

const input = "border border-brand-black/30 bg-brand-white px-3 py-2";
const label = "flex flex-col gap-1";
const labelText = "font-sans text-brand-black";

export default function OpportunityFields({
  state,
  setState,
}: {
  state: OpportunityFormState;
  setState: Dispatch<SetStateAction<OpportunityFormState>>;
}) {
  const set = <K extends keyof OpportunityFormState>(key: K) => (value: OpportunityFormState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  return (
    <div className="flex flex-col gap-4">
      <label className={label}>
        <span className={labelText}>Type</span>
        <select value={state.type} onChange={(e) => set("type")(e.target.value as "job" | "course")} className={input}>
          <option value="job">Job</option>
          <option value="course">Course</option>
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
          <span className={labelText}>Location</span>
          <input required value={state.location} onChange={(e) => set("location")(e.target.value)} className={input} />
        </label>
        <label className="flex items-center gap-2 pt-6">
          <input type="checkbox" checked={state.remote} onChange={(e) => set("remote")(e.target.checked)} />
          <span className={labelText}>Remote</span>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          <span className={labelText}>Commitment</span>
          <input value={state.commitment} onChange={(e) => set("commitment")(e.target.value)} className={input} placeholder="Full-time" />
        </label>
        <label className={label}>
          <span className={labelText}>Compensation</span>
          <input value={state.compensation} onChange={(e) => set("compensation")(e.target.value)} className={input} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className={label}>
          <span className={labelText}>Apply by</span>
          <input type="date" value={state.deadline} onChange={(e) => set("deadline")(e.target.value)} className={input} />
        </label>
        <label className={label}>
          <span className={labelText}>Start date</span>
          <input type="date" value={state.startDate} onChange={(e) => set("startDate")(e.target.value)} className={input} />
        </label>
        <label className={label}>
          <span className={labelText}>End date</span>
          <input type="date" value={state.endDate} onChange={(e) => set("endDate")(e.target.value)} className={input} />
        </label>
      </div>

      <label className={label}>
        <span className={labelText}>Tags (comma-separated)</span>
        <input value={state.tagsText} onChange={(e) => set("tagsText")(e.target.value)} className={input} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          <span className={labelText}>Apply URL</span>
          <input required type="url" value={state.applyUrl} onChange={(e) => set("applyUrl")(e.target.value)} className={input} />
        </label>
        <label className={label}>
          <span className={labelText}>Apply label</span>
          <input value={state.applyLabel} onChange={(e) => set("applyLabel")(e.target.value)} className={input} placeholder="Apply now" />
        </label>
      </div>

      <label className={label}>
        <span className={labelText}>Source URL (where this was imported from, if different from the apply URL)</span>
        <input type="url" value={state.sourceUrl} onChange={(e) => set("sourceUrl")(e.target.value)} className={input} />
      </label>
    </div>
  );
}
