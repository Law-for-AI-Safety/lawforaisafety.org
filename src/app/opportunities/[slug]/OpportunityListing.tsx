import Link from "next/link";
import WipeButton from "@/app/WipeButton";
import Rule from "@/cms/blocks/Rule";
import { closingDate, formatCommitment, formatCompensation, formatDate, formatLocation } from "@/opportunities/filter";
import { OPPORTUNITY_KINDS } from "@/opportunities/kinds";
import type { Opportunity } from "@/opportunities/types";

const FILLED = "inline-flex items-center gap-3 px-8 py-4 bg-brand-red text-brand-white text-lg font-light rounded-sm overflow-hidden";

function facts(opportunity: Opportunity): { label: string; value: string }[] {
  const kind = OPPORTUNITY_KINDS[opportunity.type];
  return [
    { label: "Location", value: formatLocation(opportunity) },
    { label: "Commitment", value: formatCommitment(opportunity) },
    { label: "Compensation", value: formatCompensation(opportunity) },
    { label: kind.deadlineLabel, value: opportunity.deadline ? formatDate(opportunity.deadline) : undefined },
    { label: kind.startLabel, value: opportunity.startDate ? formatDate(opportunity.startDate) : undefined },
    { label: kind.endLabel, value: opportunity.endDate ? formatDate(opportunity.endDate) : undefined },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact.value));
}

/**
 * A listing's page body, shared by the public page and the admin's preview of a draft, so the
 * preview shows exactly what publishing it will put up.
 */
export default function OpportunityListing({
  opportunity,
  closed,
  backToBoard = true,
}: {
  opportunity: Opportunity;
  closed: boolean;
  /** The link back to the public board, which an admin previewing a draft wouldn't find it on. */
  backToBoard?: boolean;
}) {
  const kind = OPPORTUNITY_KINDS[opportunity.type];
  const closedOn = closed ? closingDate(opportunity) : undefined;

  return (
    <>
      {backToBoard && (
        <Link href="/opportunities" className="w-fit underline">
          ← All opportunities
        </Link>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm font-light text-brand-navy/70">
        <span className={`px-2 py-0.5 ${kind.badge}`}>{kind.label}</span>
        {closedOn && <span className="px-2 py-0.5 bg-brand-black/10 text-brand-black">Closed</span>}
        {opportunity.orgUrl ? (
          <a href={opportunity.orgUrl} className="underline">
            {opportunity.org}
          </a>
        ) : (
          <span>{opportunity.org}</span>
        )}
      </div>

      <h1 className="text-[2.0625rem] md:text-[2.625rem] font-light text-brand-black leading-tight">{opportunity.title}</h1>
      <Rule />

      <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {facts(opportunity).map((fact) => (
          <div key={fact.label} className="flex flex-col">
            <dt className="text-sm font-light text-brand-navy/60">{fact.label}</dt>
            <dd className="text-lg font-light text-brand-black">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {opportunity.tags && (
        <div className="flex flex-wrap gap-2">
          {opportunity.tags.map((tag) => (
            <span key={tag} className="border border-brand-black/20 px-2 py-0.5 text-sm font-light text-brand-navy/70">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {opportunity.description.trim().split(/\n{2,}/).map((paragraph, i) => (
          <p key={i} className="text-lg font-light text-brand-navy/85 leading-relaxed">
            {paragraph}
          </p>
        ))}
      </div>

      {closedOn ? (
        <p className="text-lg font-light text-brand-navy/70">
          {kind.closedLabel} {formatDate(closedOn)}.
        </p>
      ) : (
        <WipeButton href={opportunity.applyUrl} className={FILLED} hoverBg="rgba(255,255,255,0.15)">
          {opportunity.applyLabel ?? kind.applyLabel}
        </WipeButton>
      )}
    </>
  );
}
