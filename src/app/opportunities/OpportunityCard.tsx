import Link from "next/link";
import {
  currentRun,
  formatCommitment,
  formatCompensation,
  formatDate,
  formatEventDates,
  formatLocation,
  isRunClosingSoon,
} from "@/opportunities/filter";
import { OPPORTUNITY_KINDS } from "@/opportunities/kinds";
import type { Opportunity } from "@/opportunities/types";

export default function OpportunityCard({ opportunity, now = new Date() }: { opportunity: Opportunity; now?: Date }) {
  const kind = OPPORTUNITY_KINDS[opportunity.type];
  // The round open now, for a listing with rounds; else the listing's own dates.
  const run = currentRun(opportunity, now);
  const soon = isRunClosingSoon(run, now);
  const meta = [
    run.round?.round.label,
    opportunity.type === "event"
      ? formatEventDates(run)
      : // A course's start date is when it begins (and, with no deadline, when it closes), so it shows it, as does a round.
        run.startDate && (run.round || opportunity.type === "course")
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
      : // With no deadline, a run closes on its own date (an event's day, a course's or a round's start), if at all.
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
