import Link from "next/link";
import { notFound } from "next/navigation";
import { authProviderLabel } from "@/lib/applicant-types";
import { describeSubmission, getSubmission } from "@/lib/opportunity-submission-flow";
import { getOpportunitySlugById } from "@/opportunities/data";
import { OPPORTUNITY_KINDS } from "@/opportunities/kinds";
import RejectSubmissionForm from "./RejectSubmissionForm";

type Props = { params: Promise<{ id: string }> };

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm text-brand-black/60">{label}</dt>
      <dd className="text-brand-black [overflow-wrap:anywhere] whitespace-pre-line">{children}</dd>
    </div>
  );
}

/** Submitted links are checked to be http(s) when they come in, so they are safe to render as links. */
function ExternalLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline">
      {href}
    </a>
  );
}

export default async function SubmissionPage({ params }: Props) {
  const { id } = await params;
  const submission = await getSubmission(id);
  if (!submission) notFound();

  const publishedSlug = submission.opportunityId ? await getOpportunitySlugById(submission.opportunityId) : null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <Link href="/admin/opportunities/submissions" className="w-fit underline">
        ← All submissions
      </Link>
      <h1 className="font-sans text-3xl text-brand-black [overflow-wrap:anywhere]">{describeSubmission(submission)}</h1>

      <dl className="flex flex-col gap-3">
        {submission.type && <Fact label="Type">{OPPORTUNITY_KINDS[submission.type].label}</Fact>}
        {submission.title && <Fact label="Title">{submission.title}</Fact>}
        {submission.org && <Fact label="Organisation">{submission.org}</Fact>}
        {submission.applyUrl && (
          <Fact label="Link">
            <ExternalLink href={submission.applyUrl} />
          </Fact>
        )}
        {submission.sourceUrl && (
          <Fact label={submission.title ? "Where they saw it" : "Link to the opportunity"}>
            <ExternalLink href={submission.sourceUrl} />
          </Fact>
        )}
        {submission.location && <Fact label="Location">{submission.location}</Fact>}
        {submission.title && <Fact label="Remote">{submission.remote ? "Yes" : "No"}</Fact>}
        {submission.deadline && <Fact label="Deadline">{submission.deadline}</Fact>}
        {submission.startDate && <Fact label="Start date">{submission.startDate}</Fact>}
        {submission.endDate && <Fact label="End date">{submission.endDate}</Fact>}
        {submission.description && <Fact label="Description">{submission.description}</Fact>}
        {submission.note && <Fact label="Note to the team">{submission.note}</Fact>}
        <Fact label="Submitted by">
          {submission.name ?? "Unknown"} ({submission.email ?? "no email"}), email confirmed via{" "}
          {authProviderLabel(submission.authProvider)}, on {submission.createdAt.toISOString().slice(0, 10)}
        </Fact>
      </dl>

      {submission.status === "pending" ? (
        <div className="flex flex-col gap-6 border-t border-brand-black/10 pt-6">
          <Link
            href={`/admin/opportunities/new?submission=${submission.id}`}
            className="w-fit bg-brand-navy px-5 py-2 text-brand-white"
          >
            Create listing from this
          </Link>
          <RejectSubmissionForm id={submission.id} />
        </div>
      ) : (
        <p className="border border-brand-black/20 bg-brand-navy/5 px-4 py-3 text-brand-black">
          {submission.status === "published" ? "Published" : "Rejected"}
          {submission.reviewedBy ? ` by ${submission.reviewedBy}` : ""}
          {submission.reviewedAt ? ` on ${submission.reviewedAt.toISOString().slice(0, 10)}` : ""}.
          {submission.rejectionReason && ` Reason: ${submission.rejectionReason}`}{" "}
          {publishedSlug && (
            <Link href={`/opportunities/${publishedSlug}`} className="underline">
              View the listing
            </Link>
          )}
        </p>
      )}
    </main>
  );
}
