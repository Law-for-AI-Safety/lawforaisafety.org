import Link from "next/link";
import {
  currentRun,
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
  // The round open now, for a listing with rounds; else the listing's own dates.
  const run = currentRun(opportunity, now);
  const meta = [
    run.round?.round.label,
    opportunity.type === "event"
      ? formatEventDates(run)
      : run.round && run.startDate
        ? `${kind.startLabel} ${formatDate(run.startDate)}`
        : undefined,
    opportunity.remote ? "Remote" : formatLocation(opportunity),
    formatCommitment(opportunity),
    formatCompensation(opportunity),
  ].filter(Boolean);
  const more = run.moreRounds > 0 ? `+${run.moreRounds} more round${run.moreRounds === 1 ? "" : "s"}` : undefined;
  const closing = (
    run.deadline
      ? [soon ? "Closing soon" : undefined, `${kind.deadlineLabel} ${formatDate(run.deadline)}`, more]
      : // With no deadline, only an event or a course closes (on its date), so this one is coming up.
        [soon ? "Coming up" : undefined, more]
  ).filter(Boolean);

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

      {closing.length > 0 && (
        <p className={`text-sm font-light ${run.deadline || soon ? "text-brand-red" : "text-brand-navy/70"}`}>
          {closing.join(" · ")}
        </p>
      )}

      <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">{opportunity.summary}</p>
    </Link>
  );
}
