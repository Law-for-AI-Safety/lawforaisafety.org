import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import ContentPage from "@/app/ContentPage";
import WipeButton from "@/app/WipeButton";
import Rule from "@/cms/blocks/Rule";
import { getOpportunityBySlug } from "@/opportunities/data";
import { formatCommitment, formatCompensation, formatDate, formatLocation } from "@/opportunities/filter";
import type { Opportunity } from "@/opportunities/types";

// DB-backed, not a git-committed file - render fresh on every request so a newly-saved
// listing is live immediately, with no redeploy needed.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const TYPE_LABEL: Record<Opportunity["type"], string> = { job: "Job", course: "Course" };
const TYPE_BADGE: Record<Opportunity["type"], string> = {
  job: "bg-brand-red text-brand-white",
  course: "bg-brand-navy text-brand-white",
};
const DEFAULT_APPLY_LABEL: Record<Opportunity["type"], string> = { job: "Apply now", course: "View course" };

const FILLED = "inline-flex items-center gap-3 px-8 py-4 bg-brand-red text-brand-white text-lg font-light rounded-sm overflow-hidden";

const load = cache(async (slug: string): Promise<Opportunity> => {
  const found = await getOpportunityBySlug(slug);
  if (!found) notFound();
  return found;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const opportunity = await load(slug);
  return {
    title: `${opportunity.title} at ${opportunity.org} | Opportunities | Law for AI Safety`,
    description: opportunity.summary,
    alternates: { canonical: `/opportunities/${opportunity.slug}` },
  };
}

function facts(opportunity: Opportunity): { label: string; value: string }[] {
  return [
    { label: "Location", value: formatLocation(opportunity) },
    { label: "Commitment", value: formatCommitment(opportunity) },
    { label: "Compensation", value: formatCompensation(opportunity) },
    { label: "Apply by", value: opportunity.deadline ? formatDate(opportunity.deadline) : undefined },
    { label: "Start date", value: opportunity.startDate ? formatDate(opportunity.startDate) : undefined },
    { label: "End date", value: opportunity.endDate ? formatDate(opportunity.endDate) : undefined },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact.value));
}

export default async function OpportunityPage({ params }: Props) {
  const { slug } = await params;
  const opportunity = await load(slug);

  return (
    <ContentPage gap={6}>
      <Link href="/opportunities" className="w-fit underline">
        ← All opportunities
      </Link>

      <div className="flex flex-wrap items-center gap-3 text-sm font-light text-brand-navy/70">
        <span className={`px-2 py-0.5 ${TYPE_BADGE[opportunity.type]}`}>{TYPE_LABEL[opportunity.type]}</span>
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

      <WipeButton href={opportunity.applyUrl} className={FILLED} hoverBg="rgba(255,255,255,0.15)">
        {opportunity.applyLabel ?? DEFAULT_APPLY_LABEL[opportunity.type]}
      </WipeButton>
    </ContentPage>
  );
}
