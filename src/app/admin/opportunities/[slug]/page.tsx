import Link from "next/link";
import { notFound } from "next/navigation";
import { getOpportunityBySlug, getOpportunityTags } from "@/opportunities/data";
import DraftBadge from "../DraftBadge";
import { previewHref } from "../PublishedNotice";
import EditOpportunityForm from "./EditOpportunityForm";

type Props = { params: Promise<{ slug: string }> };

export default async function EditOpportunityPage({ params }: Props) {
  const { slug } = await params;
  const [opportunity, tagSuggestions] = await Promise.all([getOpportunityBySlug(slug), getOpportunityTags()]);
  if (!opportunity) notFound();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <Link href="/admin/opportunities" className="w-fit underline">
        ← All opportunities
      </Link>
      <h1 className="font-sans text-3xl text-brand-black">{opportunity.title}</h1>
      {opportunity.status === "draft" ? (
        <p className="flex flex-wrap items-center gap-3 border border-brand-black/20 bg-brand-navy/5 px-4 py-3 text-brand-black">
          <DraftBadge />
          Not on the public site until it is published.
          <Link href={previewHref(opportunity)} className="underline">
            Preview it as it would look
          </Link>
        </p>
      ) : (
        <p className="text-brand-black/70">
          Published {opportunity.publishedAt}.{" "}
          <Link href={`/opportunities/${opportunity.slug}`} className="underline">
            View it live
          </Link>
        </p>
      )}
      <EditOpportunityForm opportunity={opportunity} tagSuggestions={tagSuggestions} />
    </main>
  );
}
