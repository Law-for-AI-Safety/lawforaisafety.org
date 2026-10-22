import type { Metadata } from "next";
import ContentPage from "@/app/ContentPage";
import Rule from "@/cms/blocks/Rule";
import { getOpportunities } from "@/opportunities/data";
import { sortOpportunities } from "@/opportunities/filter";
import OpportunitiesBoard from "./OpportunitiesBoard";

export const metadata: Metadata = {
  title: "Opportunities | Law for AI Safety",
  description: "Jobs, fellowships and courses from organisations working on AI safety and governance law.",
  alternates: { canonical: "/opportunities" },
};

export default function OpportunitiesPage() {
  const opportunities = sortOpportunities(getOpportunities());

  return (
    <ContentPage gap={6}>
      <h1 className="text-[2.625rem] md:text-[4.125rem] font-light text-brand-black leading-[1.1] tracking-tight" style={{ textWrap: "balance" }}>
        Opportunities
      </h1>
      <Rule />
      <p className="text-xl md:text-2xl font-light text-brand-navy/85 leading-relaxed max-w-2xl">
        Jobs, fellowships and courses from organisations working on AI safety and governance law.
      </p>
      <OpportunitiesBoard opportunities={opportunities} />
    </ContentPage>
  );
}
