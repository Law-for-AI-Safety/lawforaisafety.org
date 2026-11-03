"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import {
  DEFAULT_FILTERS,
  filterOpportunities,
  hasActiveFilters,
  locationOptions,
  parseFilters,
  serializeFilters,
  type OpportunityFilters,
} from "@/opportunities/filter";
import { OPPORTUNITY_KINDS, OPPORTUNITY_TYPES } from "@/opportunities/kinds";
import type { Opportunity, OpportunityType } from "@/opportunities/types";
import LocationFilter from "./LocationFilter";
import OpportunityCard from "./OpportunityCard";

const CHECKBOX = "size-5 accent-brand-navy";

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
      shown: filterOpportunities(opportunities, filters, now),
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
      onClick={() => writeFilters(DEFAULT_FILTERS)}
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
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <p aria-live="polite" className="text-lg font-light text-brand-navy/70">
              {shown.length} {shown.length === 1 ? "opportunity" : "opportunities"}
            </p>
            {active && clear}
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
