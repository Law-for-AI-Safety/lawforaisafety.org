"use client";

import type { Dispatch, SetStateAction } from "react";
import { COMMITMENT_TYPES, COMP_CURRENCIES, COMP_PERIODS, GLOBAL, MAX_ROUNDS } from "@/opportunities/schema";
import { roundForm, type OpportunityFormState, type RoundFormState } from "@/opportunities/form-state";
import { COUNTRIES } from "@/opportunities/countries";
import { OPPORTUNITY_KINDS, OPPORTUNITY_TYPES } from "@/opportunities/kinds";
import type { CommitmentType, CompPeriod, OpportunityRound, OpportunityType } from "@/opportunities/types";
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

const input = "border border-brand-black/30 bg-brand-white px-3 py-2";
const label = "flex flex-col gap-1";
const labelText = "font-sans text-brand-black";
const secondaryButton = "w-fit border border-brand-navy px-4 py-1.5 text-brand-navy";

/**
 * A deadline, start and end date, labelled for the listing's kind. With rolling applications the
 * deadline is greyed out, keeping what was typed in case rolling is turned off again; it isn't sent.
 */
function DateInputs({
  type,
  rolling,
  dates,
  onChange,
}: {
  type: OpportunityType;
  rolling: boolean;
  dates: Pick<RoundFormState, "deadline" | "startDate" | "endDate">;
  onChange: (key: "deadline" | "startDate" | "endDate", value: string) => void;
}) {
  const kind = OPPORTUNITY_KINDS[type];
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <label className={label}>
        <span className={labelText}>{kind.deadlineLabel}</span>
        <input
          type="date"
          value={rolling ? "" : dates.deadline}
          disabled={rolling}
          onChange={(e) => onChange("deadline", e.target.value)}
          className={`${input} disabled:opacity-50`}
        />
      </label>
      <label className={label}>
        <span className={labelText}>{kind.startLabel}</span>
        <input type="date" value={dates.startDate} onChange={(e) => onChange("startDate", e.target.value)} className={input} />
      </label>
      <label className={label}>
        <span className={labelText}>{kind.endLabel}</span>
        <input type="date" value={dates.endDate} onChange={(e) => onChange("endDate", e.target.value)} className={input} />
      </label>
    </div>
  );
}

/**
 * The listing's dates: one set, or for a listing that runs more than once, one row per round.
 * Splitting into rounds moves the dates already entered into the first round, and removing the
 * last round moves its dates back. Single dates have no label, so that round's label goes.
 * A round left blank isn't sent (`toOpportunityBody`), so splitting and saving at once works.
 */
function DateFields({
  state,
  setState,
}: {
  state: OpportunityFormState;
  setState: Dispatch<SetStateAction<OpportunityFormState>>;
}) {
  const setRound = (index: number, key: keyof OpportunityRound, value: string) =>
    setState((s) => ({ ...s, rounds: s.rounds.map((round, i) => (i === index ? { ...round, [key]: value } : round)) }));
  const splitIntoRounds = () =>
    setState((s) => ({
      ...s,
      rounds: [roundForm({ deadline: s.deadline, startDate: s.startDate, endDate: s.endDate }), roundForm()],
      deadline: "",
      startDate: "",
      endDate: "",
    }));
  const addRound = () => setState((s) => ({ ...s, rounds: [...s.rounds, roundForm()] }));
  const removeRound = (index: number) =>
    setState((s) => {
      if (s.rounds.length > 1) return { ...s, rounds: s.rounds.filter((_, i) => i !== index) };
      const { deadline, startDate, endDate } = s.rounds[0];
      return { ...s, rounds: [], deadline, startDate, endDate };
    });

  const kind = OPPORTUNITY_KINDS[state.type];
  const rollingToggle = (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={state.rolling} onChange={(e) => setState((s) => ({ ...s, rolling: e.target.checked }))} />
      <span className={labelText}>{kind.rollingLabel} (no deadline)</span>
    </label>
  );

  if (state.rounds.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {rollingToggle}
        <DateInputs
          type={state.type}
          rolling={state.rolling}
          dates={state}
          onChange={(key, value) => setState((s) => ({ ...s, [key]: value }))}
        />
        <button type="button" onClick={splitIntoRounds} className={secondaryButton}>
          Runs in several rounds? Add rounds
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-sans text-brand-black">Rounds</p>
      <p className="text-sm text-brand-black/70">
        Each round has its own dates. The board shows the next open round, and the listing closes after the last.
        Rounds are saved in the order they close.
      </p>
      {rollingToggle}
      {state.rounds.map((round, index) => (
        <fieldset key={round.key} className="flex flex-col gap-3 border border-brand-black/20 p-3">
          <legend className="px-1 font-sans text-brand-black">Round {index + 1}</legend>
          <label className={label}>
            <span className={labelText}>Label (optional, e.g. Intensive or Part-time)</span>
            <input value={round.label} onChange={(e) => setRound(index, "label", e.target.value)} className={input} />
          </label>
          <DateInputs type={state.type} rolling={state.rolling} dates={round} onChange={(key, value) => setRound(index, key, value)} />
          <button type="button" onClick={() => removeRound(index)} className={secondaryButton}>
            Remove round {index + 1}
          </button>
        </fieldset>
      ))}
      <button type="button" onClick={addRound} disabled={state.rounds.length >= MAX_ROUNDS} className={`${secondaryButton} disabled:opacity-60`}>
        Add round
      </button>
    </div>
  );
}

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

      <DateFields state={state} setState={setState} />

      <TagPicker value={state.tags} onChange={set("tags")} suggestions={tagSuggestions} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          <span className={labelText}>Apply link or email</span>
          <input
            required
            value={state.applyUrl}
            onChange={(e) => set("applyUrl")(e.target.value)}
            className={input}
            placeholder="https://… or an email address"
          />
        </label>
        <label className={label}>
          <span className={labelText}>Apply label</span>
          <input value={state.applyLabel} onChange={(e) => set("applyLabel")(e.target.value)} className={input} placeholder={kind.applyLabel} />
        </label>
      </div>

      <label className={label}>
        <span className={labelText}>Source URL (where this was imported from, if different from the apply link)</span>
        <input type="url" value={state.sourceUrl} onChange={(e) => set("sourceUrl")(e.target.value)} className={input} />
      </label>
    </div>
  );
}
