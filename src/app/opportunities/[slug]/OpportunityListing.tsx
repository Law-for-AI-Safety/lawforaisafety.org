import Link from "next/link";
import WipeButton from "@/app/WipeButton";
import Rule from "@/cms/blocks/Rule";
import {
  closingDate,
  currentRun,
  formatCommitment,
  formatCompensation,
  formatDate,
  formatLocation,
  roundsByClosing,
  type RoundDates,
} from "@/opportunities/filter";
import { OPPORTUNITY_KINDS } from "@/opportunities/kinds";
import type { Opportunity } from "@/opportunities/types";

const FILLED = "inline-flex items-center gap-3 px-8 py-4 bg-brand-red text-brand-white text-lg font-light rounded-sm overflow-hidden";

type Fact = { label: string; value: string };

/** A run's dates, labelled for the listing's kind, leaving out any it doesn't have. */
function dateFacts(opportunity: Opportunity, dates: RoundDates): Fact[] {
  const kind = OPPORTUNITY_KINDS[opportunity.type];
  return [
    { label: kind.deadlineLabel, value: dates.deadline },
    { label: kind.startLabel, value: dates.startDate },
    { label: kind.endLabel, value: dates.endDate },
  ].flatMap(({ label, value }) => (value ? [{ label, value: formatDate(value) }] : []));
}

function facts(opportunity: Opportunity): Fact[] {
  return [
    { label: "Location", value: formatLocation(opportunity) },
    { label: "Commitment", value: formatCommitment(opportunity) },
    { label: "Compensation", value: formatCompensation(opportunity) },
  ]
    .filter((fact): fact is Fact => Boolean(fact.value))
    .concat(dateFacts(opportunity, opportunity));
}

/**
 * Every round, in the order they close, each with its own dates. A past round stays listed,
 * marked closed, so the pattern of runs shows; the one open now is marked as next.
 */
function Rounds({ opportunity, now }: { opportunity: Opportunity; now: Date }) {
  const rounds = roundsByClosing(opportunity, now);
  const next = currentRun(opportunity, now).round;
  return (
    <section aria-labelledby="rounds-heading" className="flex flex-col gap-3">
      <h2 id="rounds-heading" className="text-xl font-light text-brand-black">
        Rounds
      </h2>
      <ol className="flex flex-col divide-y divide-brand-black/10 border-y border-brand-black/10">
        {rounds.map((view, position) => (
          <li key={view.index} className={`flex flex-col gap-2 py-3 ${view.closed ? "text-brand-navy/50" : ""}`}>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className={`text-lg font-light ${view.closed ? "" : "text-brand-black"}`}>
                {view.round.label ?? `Round ${position + 1}`}
              </h3>
              {view.closed && <span className="px-2 py-0.5 text-sm bg-brand-black/10 text-brand-black">Closed</span>}
              {!view.closed && view.index === next?.index && (
                <span className="px-2 py-0.5 text-sm bg-brand-red text-brand-white">Next</span>
              )}
            </div>
            <dl className="flex flex-wrap gap-x-8 gap-y-1">
              {dateFacts(opportunity, view.round).map((fact) => (
                <div key={fact.label} className="flex flex-col">
                  <dt className={`text-sm font-light ${view.closed ? "" : "text-brand-navy/60"}`}>{fact.label}</dt>
                  <dd className={`font-light ${view.closed ? "line-through" : "text-brand-black"}`}>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * A listing's page body, shared by the public page and the admin's preview of a draft, so the
 * preview shows exactly what publishing it will put up.
 */
export default function OpportunityListing({
  opportunity,
  closed,
  now,
  backToBoard = true,
}: {
  opportunity: Opportunity;
  closed: boolean;
  /** The moment `closed` was decided at, which also picks the round shown as next. */
  now: Date;
  /** The link back to the public board, which an admin previewing a draft wouldn't find it on. */
  backToBoard?: boolean;
}) {
  const kind = OPPORTUNITY_KINDS[opportunity.type];
  const closedOn = closed ? closingDate(opportunity, now) : undefined;

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

      {opportunity.rounds && <Rounds opportunity={opportunity} now={now} />}

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
