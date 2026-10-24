import Link from "next/link";
import { notFound } from "next/navigation";
import { getOpportunityBySlug, getOpportunityTags } from "@/opportunities/data";
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
      <EditOpportunityForm opportunity={opportunity} tagSuggestions={tagSuggestions} />
    </main>
  );
}
