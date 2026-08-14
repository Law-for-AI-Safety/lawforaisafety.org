"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PdfViewer from "./PdfViewer";

type Application = {
  id: string;
  name: string | null;
  email: string | null;
  pictureUrl: string | null;
  authProvider: "linkedin" | "google" | "email";
  organisation: string | null;
  linkedinUrl: string | null;
  hasCv: boolean;
  positionStatement: string | null;
  comments: string | null;
  newsletterOptIn: boolean;
  // Set when a decision was already made but the notification email failed
  // to send — the row is kept around (not purged) so this can be retried.
  // Which value it holds also says which action is retriable.
  failedNotification: "approved" | "rejected" | null;
};

type PriorRejection = {
  processedAt: string;
  reviewerNotes: string | null;
} | null;

type ApproveResult = {
  email: string;
  name: string | null;
  alreadyInSlack: boolean;
  slackInviteUrl: string;
};

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-1 font-sans text-xl text-brand-black">{label}</h2>
      {children}
    </div>
  );
}

export default function ApplicationDetail({
  application,
  priorRejection,
}: {
  application: Application;
  priorRejection: PriorRejection;
}) {
  const router = useRouter();
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approveResult, setApproveResult] = useState<ApproveResult | null>(null);

  async function handleApprove() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/approve/${application.id}`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Approve failed");
      setApproveResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/reject/${application.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewerNotes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Reject failed");
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed");
      setBusy(false);
    }
  }

  if (approveResult) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-12">
        <h1 className="font-sans text-3xl text-brand-black">Approved</h1>
        <p className="text-brand-black/80">
          {approveResult.name ?? approveResult.email} has been approved and
          notified by email.
        </p>

        {!approveResult.alreadyInSlack ? (
          <button
            type="button"
            className="w-fit bg-brand-navy px-5 py-2 text-brand-white"
            onClick={() => {
              navigator.clipboard.writeText(approveResult.email);
              window.open(approveResult.slackInviteUrl, "_blank");
            }}
          >
            Invite to Slack (copies email)
          </button>
        ) : (
          <p className="text-brand-black/60">
            Already a member of the Slack workspace. No invite needed.
          </p>
        )}

        <a href="/admin" className="underline">
          Back to pending applications
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="font-sans text-3xl text-brand-black">
          {application.name ?? "Unnamed applicant"}
        </h1>
        <span
          className={`border px-2 py-1 text-xs uppercase ${
            application.authProvider === "email"
              ? "border-brand-red text-brand-red"
              : "border-brand-navy text-brand-navy"
          }`}
        >
          {application.authProvider === "email"
            ? "Unverified"
            : application.authProvider}
        </span>
      </div>

      {application.authProvider === "google" && (
        <p className="border border-brand-navy bg-brand-navy/5 px-4 py-3 text-brand-navy">
          Verified via Google, no LinkedIn OAuth. Apply extra scrutiny to
          identity signals below.
        </p>
      )}

      {application.authProvider === "email" && (
        <p className="border border-brand-red bg-brand-red/10 px-4 py-3 text-brand-red">
          No identity verification at all. Name and email are entirely
          self-reported, not tied to any real account. Treat as unverified
          until independently confirmed; apply maximum scrutiny to the
          credentials below.
        </p>
      )}

      {application.failedNotification && (
        <div className="border border-brand-red bg-brand-red/10 px-4 py-3">
          <p className="text-brand-red">
            This application was already{" "}
            {application.failedNotification === "approved"
              ? "approved"
              : "rejected"}
            , but the notification email failed to send — the applicant
            hasn&apos;t been told yet, so nothing&apos;s been deleted.
          </p>
          <p className="mt-1 text-brand-black/80">
            {application.failedNotification === "approved"
              ? "Click Approve again to retry sending the approval email."
              : "Click Reject again to retry sending the rejection email."}
          </p>
        </div>
      )}

      {priorRejection && (
        <div className="border border-brand-red bg-brand-red/10 px-4 py-3">
          <p className="text-brand-red">
            Previously rejected on{" "}
            {new Date(priorRejection.processedAt).toLocaleDateString()}
          </p>
          {priorRejection.reviewerNotes && (
            <p className="mt-1 text-brand-black/80">
              {priorRejection.reviewerNotes}
            </p>
          )}
        </div>
      )}

      {application.pictureUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={application.pictureUrl}
          alt={application.name ?? "Applicant"}
          className="h-20 w-20 rounded-full object-cover"
        />
      )}

      <DetailField label="Email">
        <p className="text-brand-black/80">{application.email}</p>
      </DetailField>

      {application.organisation && (
        <DetailField label="Organisation / firm">
          <p className="text-brand-black/80">{application.organisation}</p>
        </DetailField>
      )}

      {application.linkedinUrl && (
        <DetailField label="LinkedIn profile URL">
          <p>
            <a
              href={application.linkedinUrl}
              target="_blank"
              rel="noreferrer"
              className="text-brand-black/80 underline"
            >
              {application.linkedinUrl}
            </a>{" "}
            <span className="text-sm text-brand-black/60">
              (self-reported, unverified)
            </span>
          </p>
        </DetailField>
      )}

      {application.hasCv && (
        <DetailField label="CV">
          <PdfViewer src={`/api/admin/applications/${application.id}/cv`} />
        </DetailField>
      )}

      {application.positionStatement && (
        <DetailField label="Position statement">
          <p className="whitespace-pre-wrap text-brand-black/80">
            {application.positionStatement}
          </p>
        </DetailField>
      )}

      {application.comments && (
        <DetailField label="Comments">
          <p className="whitespace-pre-wrap text-brand-black/80">
            {application.comments}
          </p>
        </DetailField>
      )}

      <DetailField label="Newsletter opt-in">
        <p className="text-brand-black/80">
          {application.newsletterOptIn ? "Yes" : "No"}
        </p>
      </DetailField>

      <label className="flex flex-col gap-1">
        <span className="font-sans text-xl text-brand-black">
          Reviewer notes (internal only)
        </span>
        <span className="text-sm text-brand-black/60">
          {application.failedNotification === "rejected"
            ? "Retrying the notification email reuses the notes saved with the original decision — editing here won't change them."
            : "Do not include names or other identifying details. Notes are retained after rejection."}
        </span>
        <textarea
          value={reviewerNotes}
          onChange={(event) => setReviewerNotes(event.target.value)}
          rows={4}
          disabled={application.failedNotification === "rejected"}
          className="border border-brand-black/30 bg-brand-white px-3 py-2 disabled:opacity-60"
        />
      </label>

      {error && <p className="text-brand-red">{error}</p>}

      <div className="flex gap-3">
        {application.failedNotification !== "rejected" && (
          <button
            type="button"
            disabled={busy}
            onClick={handleApprove}
            className="bg-brand-navy px-5 py-2 text-brand-white disabled:opacity-60"
          >
            {application.failedNotification === "approved"
              ? "Retry approval email"
              : "Approve"}
          </button>
        )}
        {application.failedNotification !== "approved" && (
          <button
            type="button"
            disabled={busy}
            onClick={handleReject}
            className="border border-brand-red px-5 py-2 text-brand-red disabled:opacity-60"
          >
            {application.failedNotification === "rejected"
              ? "Retry rejection email"
              : "Reject"}
          </button>
        )}
      </div>
    </main>
  );
}
