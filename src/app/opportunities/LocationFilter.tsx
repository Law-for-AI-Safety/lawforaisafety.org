"use client";

import { useEffect, useId, useRef, useState } from "react";
import { countryName, type CountryOption } from "@/opportunities/filter";

const CHECKBOX = "size-5 shrink-0 accent-brand-navy";
const OPTION = "flex items-center gap-3 px-4 py-2 text-lg font-light text-brand-black hover:bg-brand-navy/[0.04]";

type Location = { countries: string[]; global: boolean };

type Props = Location & {
  globalCount: number;
  options: CountryOption[];
  /** Takes a change to apply to the location as it is when applied, so quick ticks don't clash. */
  onChange: (change: (current: Location) => Partial<Location>) => void;
};

/** What the closed button says is chosen. */
function summary(countries: string[], global: boolean): string {
  const count = countries.length + (global ? 1 : 0);
  if (count === 0) return "Anywhere";
  if (count > 1) return `${count} locations`;
  return global ? "Global and remote" : countryName(countries[0]);
}

/**
 * A button that opens a panel of checkable locations: global and remote listings, then each
 * country listings are based in. Closes on Escape, from its Done button, or when a click or the
 * keyboard's focus goes outside it.
 */
export default function LocationFilter({ countries, global, globalCount, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const labelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  function toggleCountry(code: string) {
    onChange((current) => ({
      countries: current.countries.includes(code)
        ? current.countries.filter((c) => c !== code)
        : [...current.countries, code],
    }));
  }

  return (
    <div
      ref={wrapper}
      className="relative flex items-center gap-3"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          close();
        }
      }}
    >
      <span id={labelId} className="text-lg font-light text-brand-black">
        Location
      </span>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-labelledby={`${labelId} ${panelId}-value`}
        onClick={() => setOpen(!open)}
        className="relative min-w-0 flex-1 border border-brand-black/20 bg-brand-white py-2 pl-4 pr-10 text-left text-lg font-light text-brand-black transition-colors hover:border-brand-black/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy md:min-w-56 md:flex-none"
      >
        <span id={`${panelId}-value`}>{summary(countries, global)}</span>
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className={`pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-brand-navy transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M3 6l5 5 5-5" />
        </svg>
      </button>

      <div
        id={panelId}
        role="group"
        aria-labelledby={labelId}
        hidden={!open}
        // Focusable, so a click on the panel's padding keeps focus inside and the panel open.
        tabIndex={-1}
        className="absolute left-0 right-0 top-full z-20 outline-none mt-2 border border-brand-black/20 bg-brand-white shadow-lg md:right-auto md:min-w-80"
      >
        <div className="max-h-80 overflow-y-auto py-2">
          <label className={OPTION}>
            <input
              type="checkbox"
              checked={global}
              onChange={(event) => {
                const checked = event.target.checked;
                onChange(() => ({ global: checked }));
              }}
              className={CHECKBOX}
            />
            Global and remote ({globalCount})
          </label>
          <hr className="my-2 border-brand-black/10" />
          {options.map((option) => (
            <label key={option.code} className={OPTION}>
              <input
                type="checkbox"
                checked={countries.includes(option.code)}
                onChange={() => toggleCountry(option.code)}
                className={CHECKBOX}
              />
              {option.name} ({option.count})
            </label>
          ))}
        </div>
        <div className="flex justify-between gap-4 border-t border-brand-black/10 px-4 py-3">
          <button
            type="button"
            onClick={() => onChange(() => ({ countries: [], global: false }))}
            className="text-lg font-light text-brand-navy underline hover:text-brand-black"
          >
            Any location
          </button>
          <button
            type="button"
            onClick={close}
            className="bg-brand-navy px-4 py-1 text-lg font-light text-brand-white hover:bg-brand-black"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
