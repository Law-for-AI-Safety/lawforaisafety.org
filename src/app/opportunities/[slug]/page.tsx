import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import ContentPage from "@/app/ContentPage";
import { getCachedOpportunityBySlug } from "@/opportunities/data";
import { isClosed } from "@/opportunities/filter";
import type { PublishedOpportunity } from "@/opportunities/types";
import OpportunityListing from "./OpportunityListing";

type Props = { params: Promise<{ slug: string }> };

/**
 * The listing, and whether it has closed. Decided once per request, so the metadata's `noindex`
 * and the page body can't fall either side of the closing moment, or of a round's.
 */
const load = cache(async (slug: string): Promise<{ opportunity: PublishedOpportunity; closed: boolean; now: Date }> => {
  // Rendered per request, never prerendered: Netlify builds have no database, and whether
  // the listing has closed depends on today's date. `connection()` makes the page dynamic while
  // leaving on the data cache the listing is read through.
  await connection();
  const found = await getCachedOpportunityBySlug(slug);
  if (!found) notFound();
  const now = new Date();
  return { opportunity: found, closed: isClosed(found, now), now };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { opportunity, closed } = await load(slug);
  return {
    title: `${opportunity.title} at ${opportunity.org} | Opportunities | Law for AI Safety`,
    description: opportunity.summary,
    alternates: { canonical: `/opportunities/${opportunity.slug}` },
    // Kept up for anyone with the link, but out of search results once it can't be applied to.
    ...(closed && { robots: { index: false } }),
  };
}

export default async function OpportunityPage({ params }: Props) {
  const { slug } = await params;
  const { opportunity, closed, now } = await load(slug);
  return (
    <ContentPage gap={6}>
      <OpportunityListing opportunity={opportunity} closed={closed} now={now} />
    </ContentPage>
  );
}
