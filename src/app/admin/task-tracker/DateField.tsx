"use client";

import { useId } from "react";
import { addDaysISO, describeRelative, endOfMonthISO, formatDate, todayISO } from "./dates";

export type DatePreset = "today" | "nextWeek" | "twoWeeks" | "endOfMonth";

const PRESETS: Record<DatePreset, { label: string; value: (today: string) => string }> = {
  today: { label: "Today", value: (today) => today },
  nextWeek: { label: "+1 week", value: (today) => addDaysISO(today, 7) },
  twoWeeks: { label: "+2 weeks", value: (today) => addDaysISO(today, 14) },
  endOfMonth: { label: "End of month", value: (today) => endOfMonthISO(today) },
};

/**
 * Native date input (keeps the phone's own picker and screen-reader support)
 * with the chosen date spelled out underneath — the input itself shows
 * "dd/mm/yyyy", which is hard to sanity-check at a glance — plus one-tap
 * shortcuts for the dates people actually pick.
 */
export default function DateField({
  label,
  value,
  onChange,
  presets = [],
  hint,
  suggestion,
  warning,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  presets?: DatePreset[];
  hint?: string;
  /** A date worth offering, e.g. the day after this task's dependencies end. */
  suggestion?: { date: string; label: string; note: string } | null;
  /** Shown in red under the field when the current value doesn't add up. */
  warning?: string | null;
}) {
  const inputId = useId();
  const describedById = useId();

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="font-sans text-brand-black">
        {label}
      </label>
      <input
        id={inputId}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={describedById}
        className="border border-brand-black/30 bg-brand-white px-3 py-2"
      />
      <p id={describedById} className="text-sm text-brand-black/70">
        {/* Relative wording depends on the viewer's "today", which can differ
            from the server's around midnight. */}
        <span suppressHydrationWarning>
          {value ? `${formatDate(value)} · ${describeRelative(value)}` : (hint ?? "Not set")}
        </span>
        {value && hint && <span className="block">{hint}</span>}
      </p>
      {warning && <p className="text-sm text-brand-red">{warning}</p>}

      {suggestion &&
        suggestion.date !== value &&
        (!value || value < suggestion.date ? (
          // The current date is missing or impossible — offer to fix it.
          <p className="text-sm">
            <button
              type="button"
              onClick={() => onChange(suggestion.date)}
              className="text-left underline"
            >
              {suggestion.label}
            </button>
          </p>
        ) : (
          // Already late enough; the earliest date is context, not a fix.
          <p className="text-sm text-brand-black/70">{suggestion.note}</p>
        ))}

      {(presets.length > 0 || value) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(PRESETS[preset].value(todayISO()))}
              className="underline"
            >
              {PRESETS[preset].label}
            </button>
          ))}
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="underline"
              aria-label={`Clear ${label.toLowerCase()}`}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
