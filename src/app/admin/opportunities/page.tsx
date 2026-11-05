import Link from "next/link";
import { getOpportunities } from "@/opportunities/data";
import { currentRun, sortOpportunities } from "@/opportunities/filter";
import { OPPORTUNITY_KINDS } from "@/opportunities/kinds";
import type { Opportunity } from "@/opportunities/types";
import DraftBadge from "./DraftBadge";
import { previewHref } from "./PublishedNotice";

/** The deadline the board goes by (for a listing with rounds, the next round's), and how many rounds it has. */
function datesNote(opportunity: Opportunity, now: Date): string {
  const { deadline } = currentRun(opportunity, now);
  const rounds = opportunity.rounds?.length;
  return [
    deadline ? `${OPPORTUNITY_KINDS[opportunity.type].deadlineLabel} ${deadline}` : undefined,
    rounds ? `${rounds} round${rounds === 1 ? "" : "s"}` : undefined,
  ]
    .map((part) => (part ? ` · ${part}` : ""))
    .join("");
}

function OpportunityList({ opportunities, now }: { opportunities: Opportunity[]; now: Date }) {
  return (
    <ul className="flex flex-col divide-y divide-brand-black/10 border-y border-brand-black/10">
      {opportunities.map((opportunity) => (
        <li key={opportunity.slug} className="flex flex-col gap-1 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/admin/opportunities/${opportunity.slug}`} className="font-sans text-lg text-brand-black underline">
              {opportunity.title}
            </Link>
            {opportunity.status === "draft" && <DraftBadge />}
          </div>
          <span className="text-sm text-brand-black/70">
            {OPPORTUNITY_KINDS[opportunity.type].label} · {opportunity.org}
            {datesNote(opportunity, now)}
            {opportunity.status === "draft" && (
              <>
                {" · "}
                <Link href={previewHref(opportunity)} className="underline">
                  Preview
                </Link>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function OpportunitiesListPage() {
  const now = new Date();
  const all = sortOpportunities(await getOpportunities(), "closing", now);
  const drafts = all.filter((opportunity) => opportunity.status === "draft");
  const published = all.filter((opportunity) => opportunity.status === "published");

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-sans text-3xl text-brand-black">Opportunities</h1>
        <Link href="/admin/opportunities/new" className="w-fit bg-brand-navy px-5 py-2 text-brand-white">
          New opportunity
        </Link>
      </div>

      {all.length === 0 && <p className="text-brand-black/70">There are no opportunities yet.</p>}

      {drafts.length > 0 && (
        <section id="drafts" aria-labelledby="drafts-heading" className="flex flex-col gap-3">
          <h2 id="drafts-heading" className="font-sans text-xl text-brand-black">
            Drafts ({drafts.length})
          </h2>
          <p className="text-brand-black/70">Not on the public site. Open one to check it, then publish it.</p>
          <OpportunityList opportunities={drafts} now={now} />
        </section>
      )}

      {published.length > 0 && (
        <section aria-labelledby={drafts.length > 0 ? "published-heading" : undefined} className="flex flex-col gap-3">
          {drafts.length > 0 && (
            <h2 id="published-heading" className="font-sans text-xl text-brand-black">
              Published
            </h2>
          )}
          <OpportunityList opportunities={published} now={now} />
        </section>
      )}
    </main>
  );
}
