import Link from "next/link";
import { getOpportunities } from "@/opportunities/data";
import { sortOpportunities } from "@/opportunities/filter";

export default function OpportunitiesListPage() {
  const opportunities = sortOpportunities(getOpportunities());

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-sans text-3xl text-brand-black">Opportunities</h1>
        <Link href="/admin/opportunities/new" className="w-fit bg-brand-navy px-5 py-2 text-brand-white">
          New opportunity
        </Link>
      </div>

      {opportunities.length === 0 ? (
        <p className="text-brand-black/70">There are no opportunities yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-brand-black/10 border-y border-brand-black/10">
          {opportunities.map((opportunity) => (
            <li key={opportunity.slug} className="flex flex-col gap-1 py-4">
              <Link href={`/admin/opportunities/${opportunity.slug}`} className="font-sans text-lg text-brand-black underline">
                {opportunity.title}
              </Link>
              <span className="text-sm text-brand-black/70">
                {opportunity.type === "job" ? "Job" : "Course"} · {opportunity.org}
                {opportunity.deadline ? ` · Apply by ${opportunity.deadline}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
