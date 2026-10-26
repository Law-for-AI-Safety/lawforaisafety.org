"use client";

import { useState } from "react";
import { filterOpportunities, type OpportunityTypeFilter } from "@/opportunities/filter";
import { OPPORTUNITY_KINDS, OPPORTUNITY_TYPES } from "@/opportunities/kinds";
import type { Opportunity } from "@/opportunities/types";
import OpportunityCard from "./OpportunityCard";

const TABS: { id: OpportunityTypeFilter; label: string }[] = [
  { id: "all", label: "All" },
  ...OPPORTUNITY_TYPES.map((type) => ({ id: type, label: OPPORTUNITY_KINDS[type].plural })),
];

export default function OpportunitiesBoard({ opportunities }: { opportunities: Opportunity[] }) {
  const [filter, setFilter] = useState<OpportunityTypeFilter>("all");
  const shown = filterOpportunities(opportunities, filter);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 overflow-x-auto border-b border-brand-black/10" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={filter === tab.id}
            onClick={() => setFilter(tab.id)}
            className={`shrink-0 rounded-t-sm px-5 py-3 text-lg transition-colors ${
              filter === tab.id ? "bg-brand-navy text-brand-white" : "text-brand-black/60 hover:text-brand-black"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-6 text-lg font-light text-brand-navy/70">No live opportunities in this category right now.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-brand-black/10">
          {shown.map((opportunity) => (
            <li key={opportunity.slug}>
              <OpportunityCard opportunity={opportunity} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
