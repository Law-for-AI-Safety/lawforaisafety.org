"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import {
  DEFAULT_FILTERS,
  filterOpportunities,
  hasActiveFilters,
  locationOptions,
  OPPORTUNITY_SORTS,
  parseFilters,
  serializeFilters,
  sortOpportunities,
  type OpportunityFilters,
  type OpportunitySort,
} from "@/opportunities/filter";
import { OPPORTUNITY_KINDS, OPPORTUNITY_TYPES } from "@/opportunities/kinds";
import type { Opportunity, OpportunityType } from "@/opportunities/types";
import LocationFilter from "./LocationFilter";
import OpportunityCard from "./OpportunityCard";

const CHECKBOX = "size-5 accent-brand-navy";

const SORT_LABEL: Record<OpportunitySort, string> = {
  closing: "Closing soonest",
  newest: "Newest",
};

/** The filters in the address bar right now, which may be ahead of the last render. */
function currentFilters(): OpportunityFilters {
  return parseFilters(new URLSearchParams(window.location.search));
}

/**
 * Writes filters to the query string. The board already holds every open listing, so it uses
 * the History API, which Next keeps `useSearchParams` in step with, rather than a router
 * navigation, which would ask the server to render the page again.
 */
function writeFilters(next: OpportunityFilters) {
  const query = serializeFilters(next);
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

/** Applies a change to the filters as they are now, so quick clicks each build on the last. */
function updateFilters(change: (current: OpportunityFilters) => Partial<OpportunityFilters>) {
  const current = currentFilters();
  writeFilters({ ...current, ...change(current) });
}

/**
 * `now` comes from the server's render, so the server's HTML and the browser's hydration agree on
 * which listings are closing soon.
 */
export default function OpportunitiesBoard({ opportunities, now }: { opportunities: Opportunity[]; now: Date }) {
  // The filters live in the query string, so a filtered view can be shared. The page renders
  // per request, so these are read on the server too.
  const query = useSearchParams().toString();
  const { filters, shown, locationChoices } = useMemo(() => {
    const filters = parseFilters(new URLSearchParams(query));
    return {
      filters,
      shown: sortOpportunities(filterOpportunities(opportunities, filters, now), filters.sort),
      // Counted under the other filters but not the location filter itself, so ticking one
      // country leaves the others' counts alone. Each count is how many listings are based
      // there; a remote one is counted under its country and under global and remote alike.
      locationChoices: locationOptions(
        filterOpportunities(opportunities, { ...filters, countries: [], global: false }, now),
        filters.countries,
      ),
    };
  }, [opportunities, now, query]);
  const active = hasActiveFilters(filters);

  function toggleType(type: OpportunityType) {
    updateFilters(({ types }) => ({
      types: types.includes(type) ? types.filter((t) => t !== type) : [...types, type],
    }));
  }

  const clear = (
    <button
      type="button"
      // Clears what narrows the board, keeping the order it is listed in.
      onClick={() => writeFilters({ ...DEFAULT_FILTERS, sort: currentFilters().sort })}
      className="text-lg font-light text-brand-navy underline hover:text-brand-black"
    >
      Clear filters
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 border-b border-brand-black/10 pb-6">
        {/* A floated legend joins the fieldset's flex row, so "Type" sits inline with its boxes. */}
        <fieldset className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <legend className="float-left text-lg font-light text-brand-black">Type</legend>
          {OPPORTUNITY_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-3 text-lg font-light text-brand-black">
              <input
                type="checkbox"
                checked={filters.types.includes(type)}
                onChange={() => toggleType(type)}
                className={CHECKBOX}
              />
              {OPPORTUNITY_KINDS[type].plural}
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-center md:gap-8">
          <LocationFilter
            countries={filters.countries}
            global={filters.global}
            globalCount={locationChoices.globalCount}
            options={locationChoices.countries}
            onChange={updateFilters}
          />

          <label className="flex items-center gap-3 text-lg font-light text-brand-black">
            <input
              type="checkbox"
              checked={filters.closingSoon}
              onChange={(event) => updateFilters(() => ({ closingSoon: event.target.checked }))}
              className={CHECKBOX}
            />
            Closing soon
          </label>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-start gap-2 py-6">
          <p className="text-lg font-light text-brand-navy/70">
            {active ? "No opportunities match these filters." : "No live opportunities right now."}
          </p>
          {active && clear}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <p aria-live="polite" className="text-lg font-light text-brand-navy/70">
                {shown.length} {shown.length === 1 ? "opportunity" : "opportunities"}
              </p>
              {active && clear}
            </div>
            <label className="flex items-center gap-3 text-lg font-light text-brand-black">
              Sort by
              <span className="relative">
                <select
                  value={filters.sort}
                  onChange={(event) => {
                    const sort = event.target.value as OpportunitySort;
                    updateFilters(() => ({ sort }));
                  }}
                  className="appearance-none border border-brand-black/20 bg-brand-white py-2 pl-4 pr-10 text-lg font-light text-brand-black transition-colors hover:border-brand-black/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                >
                  {OPPORTUNITY_SORTS.map((sort) => (
                    <option key={sort} value={sort}>
                      {SORT_LABEL[sort]}
                    </option>
                  ))}
                </select>
                <svg
                  aria-hidden
                  viewBox="0 0 16 16"
                  className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-brand-navy"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M3 6l5 5 5-5" />
                </svg>
              </span>
            </label>
          </div>
          <ul className="flex flex-col divide-y divide-brand-black/10">
            {shown.map((opportunity) => (
              <li key={opportunity.slug}>
                <OpportunityCard opportunity={opportunity} now={now} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
