import Link from "next/link";
import { describeSubmission, listSubmissions } from "@/lib/opportunity-submission-flow";
import { OPPORTUNITY_KINDS } from "@/opportunities/kinds";

const STATUS_LABEL = { pending: "To review", published: "Published", rejected: "Rejected", draft: "Draft" } as const;

export default async function SubmissionsPage() {
  const submissions = await listSubmissions();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <h1 className="font-sans text-3xl text-brand-black">Submissions</h1>
      <p className="text-brand-black/70">
        Opportunities sent in through the public form. Nothing here is live until you create a listing from it.
      </p>

      {submissions.length === 0 ? (
        <p className="text-brand-black/70">No submissions yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-brand-black/10 border-y border-brand-black/10">
          {submissions.map((submission) => (
            <li key={submission.id} className="flex flex-col gap-1 py-4">
              <Link
                href={`/admin/opportunities/submissions/${submission.id}`}
                className="font-sans text-lg text-brand-black underline [overflow-wrap:anywhere]"
              >
                {describeSubmission(submission)}
              </Link>
              <span className="text-sm text-brand-black/70">
                <span className={submission.status === "pending" ? "font-semibold text-brand-red" : ""}>
                  {STATUS_LABEL[submission.status]}
                </span>
                {submission.type ? ` · ${OPPORTUNITY_KINDS[submission.type].label}` : ""} · from {submission.name ?? "unknown"} ·{" "}
                {submission.createdAt.toISOString().slice(0, 10)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
