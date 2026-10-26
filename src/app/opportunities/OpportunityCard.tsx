import Link from "next/link";
import {
  formatCommitment,
  formatCompensation,
  formatDate,
  formatEventDates,
  formatLocation,
  isClosingSoon,
} from "@/opportunities/filter";
import { OPPORTUNITY_KINDS } from "@/opportunities/kinds";
import type { Opportunity } from "@/opportunities/types";

export default function OpportunityCard({ opportunity, now = new Date() }: { opportunity: Opportunity; now?: Date }) {
  const kind = OPPORTUNITY_KINDS[opportunity.type];
  const soon = isClosingSoon(opportunity, now);
  const meta = [
    opportunity.type === "event" ? formatEventDates(opportunity) : undefined,
    opportunity.remote ? "Remote" : formatLocation(opportunity),
    formatCommitment(opportunity),
    formatCompensation(opportunity),
  ].filter(Boolean);

  return (
    <Link
      href={`/opportunities/${opportunity.slug}`}
      className="flex flex-col gap-2 py-6 hover:bg-brand-navy/[0.02]"
    >
      <div className="flex flex-wrap items-center gap-3 text-sm font-light text-brand-navy/70">
        <span className={`px-2 py-0.5 ${kind.badge}`}>{kind.label}</span>
        <span>{opportunity.org}</span>
      </div>

      <p className="text-xl md:text-2xl font-light text-brand-black">{opportunity.title}</p>

      <p className="text-base font-light text-brand-navy/70">{meta.join(" · ")}</p>

      {opportunity.deadline ? (
        <p className="text-sm font-light text-brand-red">
          {soon ? "Closing soon — " : ""}
          {kind.deadlineLabel} {formatDate(opportunity.deadline)}
        </p>
      ) : (
        // With no deadline, only an event closes (after its date), so this is an event coming up.
        soon && <p className="text-sm font-light text-brand-red">Coming up</p>
      )}

      <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">{opportunity.summary}</p>
    </Link>
  );
}
