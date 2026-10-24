import Link from "next/link";
import { getOpportunityTags } from "@/opportunities/data";
import NewOpportunityForm from "./NewOpportunityForm";

export default async function NewOpportunityPage() {
  const tagSuggestions = await getOpportunityTags();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <Link href="/admin/opportunities" className="w-fit underline">
        ← All opportunities
      </Link>
      <h1 className="font-sans text-3xl text-brand-black">New opportunity</h1>
      <NewOpportunityForm tagSuggestions={tagSuggestions} />
    </main>
  );
}
