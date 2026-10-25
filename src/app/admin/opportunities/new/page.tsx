import Link from "next/link";
import { notFound } from "next/navigation";
import { describeSubmission, getSubmission } from "@/lib/opportunity-submission-flow";
import { getOpportunityTags } from "@/opportunities/data";
import { opportunityFormFromSubmission } from "../OpportunityFields";
import NewOpportunityForm from "./NewOpportunityForm";

type Props = { searchParams: Promise<{ submission?: string }> };

export default async function NewOpportunityPage({ searchParams }: Props) {
  const { submission: submissionId } = await searchParams;
  const [tagSuggestions, submission] = await Promise.all([
    getOpportunityTags(),
    submissionId ? getSubmission(submissionId) : null,
  ]);
  if (submissionId && submission?.status !== "pending") notFound();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <Link href="/admin/opportunities" className="w-fit underline">
        ← All opportunities
      </Link>
      <h1 className="font-sans text-3xl text-brand-black">New opportunity</h1>
      {submission && (
        <p className="border border-brand-black/20 bg-brand-navy/5 px-4 py-3 text-brand-black">
          Started from{" "}
          <Link href={`/admin/opportunities/submissions/${submission.id}`} className="underline">
            {describeSubmission(submission)}
          </Link>
          , sent in by {submission.name ?? "unknown"}. Fill in the rest (country, summary, and anything from the link),
          then create it: the submitter is emailed the link.
        </p>
      )}
      <NewOpportunityForm
        tagSuggestions={tagSuggestions}
        initial={submission ? opportunityFormFromSubmission(submission) : undefined}
        submissionId={submission?.id}
      />
    </main>
  );
}
