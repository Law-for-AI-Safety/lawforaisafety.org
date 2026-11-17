"use client";

import { useId } from "react";
import { offsetLabel } from "@/newsletter/schedule";
import { useTimeZone } from "./LocalTime";

/**
 * A date and time in the viewer's own timezone, which is named beside it. The value is the
 * `datetime-local` text; `whenFromInput` turns it into the instant.
 */
export default function WhenPicker({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const id = useId();
  const timeZone = useTimeZone();
  const at = whenFromInput(value);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-brand-black/80">
        {label}
      </label>
      <input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-64 rounded-sm border border-brand-black/30 px-2 py-1"
      />
      <span className="text-sm text-brand-black/70">
        Your timezone: <strong>{timeZone}</strong> ({offsetLabel(at ?? new Date(), timeZone)}). Times are shown and sent in it.
      </span>
    </div>
  );
}

/** The instant a `datetime-local` value means in the browser's timezone, or null when empty. */
export function whenFromInput(value: string): Date | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}
