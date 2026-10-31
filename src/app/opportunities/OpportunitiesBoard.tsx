"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

export default function OpportunitiesBoard({ opportunities }: { opportunities: Opportunity[] }) {
  const router = useRouter();
  const pathname = usePathname();
  // The filters live in the query string, so a filtered view can be shared and the back button
  // undoes nothing it shouldn't. The page renders per request, so these are read on the server too.
  const filters = parseFilters(useSearchParams());
  const shown = filterOpportunities(opportunities, filters, new Date());
  const active = hasActiveFilters(filters);
  const locationChoices = locationOptions(opportunities, filters.countries);

  function update(next: OpportunityFilters) {
    const query = serializeFilters(next);
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function toggleType(type: OpportunityType) {
    const types = filters.types.includes(type) ? filters.types.filter((t) => t !== type) : [...filters.types, type];
    update({ ...filters, types });
  }

  const clear = (
    <button
      type="button"
      onClick={() => update(DEFAULT_FILTERS)}
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
            onChange={(location) => update({ ...filters, ...location })}
          />

          <label className="flex items-center gap-3 text-lg font-light text-brand-black">
            <input
              type="checkbox"
              checked={filters.closingSoon}
              onChange={(event) => update({ ...filters, closingSoon: event.target.checked })}
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
                <OpportunityCard opportunity={opportunity} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
