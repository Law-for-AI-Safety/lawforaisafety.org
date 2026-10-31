"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_FILTERS,
  countryOptions,
  filterOpportunities,
  hasActiveFilters,
  parseFilters,
  serializeFilters,
  type OpportunityFilters,
} from "@/opportunities/filter";
import { OPPORTUNITY_KINDS, OPPORTUNITY_TYPES } from "@/opportunities/kinds";
import type { Opportunity, OpportunityType } from "@/opportunities/types";
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
        <div role="group" aria-label="Type" className="flex flex-wrap gap-2">
          {OPPORTUNITY_TYPES.map((type) => {
            const kind = OPPORTUNITY_KINDS[type];
            const selected = filters.types.includes(type);
            return (
              <button
                key={type}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleType(type)}
                className={`border px-4 py-2 text-lg font-light transition-colors ${
                  selected ? kind.badge : "border-brand-black/20 text-brand-black/60 hover:border-brand-black/40 hover:text-brand-black"
                }`}
              >
                {kind.plural}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-center md:gap-8">
          <label className="flex items-center gap-3 text-lg font-light text-brand-black">
            Country
            {/* Native, so phones show their own picker; restyled to sit beside the square chips. */}
            <span className="relative flex min-w-0 flex-1 md:flex-none">
              <select
                value={filters.country ?? ""}
                onChange={(event) => update({ ...filters, country: event.target.value || undefined })}
                className="w-full min-w-0 cursor-pointer appearance-none rounded-none border border-brand-black/20 bg-brand-white py-2 pl-4 pr-10 text-lg font-light text-brand-black transition-colors hover:border-brand-black/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
              >
                <option value="">Any country</option>
                {countryOptions(opportunities, filters.country).map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name} ({option.count})
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

          <label className="flex items-center gap-3 text-lg font-light text-brand-black">
            <input
              type="checkbox"
              checked={filters.includeGlobal}
              onChange={(event) => update({ ...filters, includeGlobal: event.target.checked })}
              className={CHECKBOX}
            />
            Include global and remote
          </label>

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
