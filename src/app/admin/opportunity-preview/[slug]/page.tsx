import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ContentPage from "@/app/ContentPage";
import OpportunityListing from "@/app/opportunities/[slug]/OpportunityListing";
import { getOpportunityBySlug } from "@/opportunities/data";
import { isClosed } from "@/opportunities/filter";
import { getAdminSession, isOpportunitiesTeamEmail } from "@/lib/session";

// Never indexed: robots.ts disallows /admin, next.config.ts sends X-Robots-Tag on it, and
// this meta tag covers a copy of the HTML seen anywhere else.
export const metadata: Metadata = {
  title: "LAIS - Opportunity preview",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * A listing as its public page shows it, drafts included, for an admin to check a draft before
 * publishing it. Outside the opportunities admin's own layout so it has the site's nav, as the
 * public page does, and outside /admin/preview, whose pages alone may be framed (next.config.ts).
 */
export default async function OpportunityPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!isOpportunitiesTeamEmail(session.email)) redirect("/admin");

  const { slug } = await params;
  const opportunity = await getOpportunityBySlug(slug);
  if (!opportunity) notFound();

  return (
    <ContentPage gap={6}>
      <p className="border border-brand-black/20 bg-brand-navy/5 px-4 py-3 text-brand-black">
        {opportunity.status === "draft"
          ? "Preview of a draft. It isn't on the public site until it is published."
          : "Preview of a published listing, as it is on the public site."}{" "}
        <Link href={`/admin/opportunities/${opportunity.slug}`} className="underline">
          Back to editing
        </Link>
      </p>
      <OpportunityListing opportunity={opportunity} closed={isClosed(opportunity, new Date())} />
    </ContentPage>
  );
}
