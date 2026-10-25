import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import ContentPage from "@/app/ContentPage";
import Rule from "@/cms/blocks/Rule";
import { getCachedOpportunities } from "@/opportunities/data";
import { openOpportunities, sortOpportunities } from "@/opportunities/filter";
import OpportunitiesBoard from "./OpportunitiesBoard";

export const metadata: Metadata = {
  title: "Opportunities | Law for AI Safety",
  description: "Jobs, fellowships, projects, courses and events from organisations working on AI safety and governance law.",
  alternates: { canonical: "/opportunities" },
};

export default async function OpportunitiesPage() {
  // Rendered per request, never prerendered: Netlify builds have no database, and which
  // listings have closed depends on today's date. `connection()` rather than `force-dynamic`,
  // so the data cache the listings are read through stays on.
  await connection();
  // Closed listings keep their own page, but drop off the board.
  const opportunities = sortOpportunities(openOpportunities(await getCachedOpportunities(), new Date()));

  return (
    <ContentPage gap={6}>
      <h1 className="text-[2.625rem] md:text-[4.125rem] font-light text-brand-black leading-[1.1] tracking-tight" style={{ textWrap: "balance" }}>
        Opportunities
      </h1>
      <Rule />
      <p className="text-xl md:text-2xl font-light text-brand-navy/85 leading-relaxed max-w-2xl">
        Jobs, fellowships, projects, courses and events from organisations working on AI safety and governance law.
      </p>
      <p className="text-lg font-light text-brand-navy/85">
        Know of one we&apos;re missing?{" "}
        <Link href="/opportunities/submit" className="underline">
          Submit an opportunity
        </Link>
        .
      </p>
      <OpportunitiesBoard opportunities={opportunities} />
    </ContentPage>
  );
}
