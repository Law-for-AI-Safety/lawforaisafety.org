import Link from "next/link";
import { formatDate, isClosingSoon } from "@/opportunities/filter";
import type { Opportunity } from "@/opportunities/types";

const TYPE_LABEL: Record<Opportunity["type"], string> = { job: "Job", course: "Course" };
const TYPE_BADGE: Record<Opportunity["type"], string> = {
  job: "bg-brand-red text-brand-white",
  course: "bg-brand-navy text-brand-white",
};

export default function OpportunityCard({ opportunity, now = new Date() }: { opportunity: Opportunity; now?: Date }) {
  const meta = [opportunity.remote ? "Remote" : opportunity.location, opportunity.commitment, opportunity.compensation].filter(
    Boolean,
  );

  return (
    <Link
      href={`/opportunities/${opportunity.slug}`}
      className="flex flex-col gap-2 py-6 hover:bg-brand-navy/[0.02]"
    >
      <div className="flex flex-wrap items-center gap-3 text-sm font-light text-brand-navy/70">
        <span className={`px-2 py-0.5 ${TYPE_BADGE[opportunity.type]}`}>{TYPE_LABEL[opportunity.type]}</span>
        <span>{opportunity.org}</span>
      </div>

      <p className="text-xl md:text-2xl font-light text-brand-black">{opportunity.title}</p>

      <p className="text-base font-light text-brand-navy/70">{meta.join(" · ")}</p>

      {opportunity.deadline && (
        <p className="text-sm font-light text-brand-red">
          {isClosingSoon(opportunity.deadline, now) ? "Closing soon — " : ""}
          Apply by {formatDate(opportunity.deadline)}
        </p>
      )}

      <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">{opportunity.summary}</p>
    </Link>
  );
}
