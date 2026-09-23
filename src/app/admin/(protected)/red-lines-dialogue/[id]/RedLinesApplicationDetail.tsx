"use client";

import { useState } from "react";
import Link from "next/link";

type Application = {
  id: string;
  name: string | null;
  email: string | null;
  pictureUrl: string | null;
  authProvider: "linkedin" | "google" | "email";
  linkedinUrl: string | null;
  areaOfExpertise: "legal_governance" | "technical" | null;
  motivation: string | null;
  availableHours: number | null;
  availableOct12: boolean;
  availableNov9: boolean;
  availableDec7: boolean;
  euParliamentInterest: "yes" | "maybe" | "no" | null;
  affiliation: string | null;
  publicationExample: string | null;
  status: "pending" | "approved" | "rejected";
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewerNotes: string | null;
  contactedBy: string | null;
  contactedAt: string | null;
};

const AREA_LABELS: Record<string, string> = {
  legal_governance: "Legal / governance",
  technical: "Technical",
};

const EU_INTEREST_LABELS: Record<string, string> = {
  yes: "Yes",
  maybe: "Possibly",
  no: "No",
};

const MAILTO_SUBJECT: Record<"approved" | "rejected", string> = {
  approved: "Your Red Lines Dialogues application",
  rejected: "Update on your Red Lines Dialogues application",
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

/**
 * Decisions here aren't followed by an automatic email: the working group
 * contacts applicants by hand. This hands the reviewer the address, a copy
 * button, and a mailto: link with a sensible subject pre-filled, plus a way
 * to mark that the contact actually happened, so the admin list can show
 * who's still waiting to hear back.
 */
function EmailByHand({
  applicationId,
  email,
  outcome,
  contactedBy: initialContactedBy,
  contactedAt: initialContactedAt,
}: {
  applicationId: string;
  email: string;
  outcome: "approved" | "rejected";
  contactedBy: string | null;
  contactedAt: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [contactedBy, setContactedBy] = useState(initialContactedBy);
  const [contactedAt, setContactedAt] = useState(initialContactedAt);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);

  async function handleMarkContacted() {
    setMarking(true);
    setMarkError(null);
    try {
      const response = await fetch(`/api/admin/red-lines/contacted/${applicationId}`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not mark as contacted");
      setContactedBy(data.contactedBy);
      setContactedAt(data.contactedAt);
    } catch (err) {
      setMarkError(err instanceof Error ? err.message : "Could not mark as contacted");
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border border-brand-navy bg-brand-navy/5 px-4 py-3">
      <p className="text-brand-navy">
        No email was sent automatically. Let them know by hand:
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`mailto:${email}?subject=${encodeURIComponent(MAILTO_SUBJECT[outcome])}`}
          className="bg-brand-navy px-4 py-2 text-brand-white"
        >
          Email {email}
        </a>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(email);
            setCopied(true);
          }}
          className="border border-brand-navy px-4 py-2 text-brand-navy"
        >
          {copied ? "Copied" : "Copy address"}
        </button>
      </div>

      <div className="mt-1 border-t border-brand-navy/20 pt-2">
        {contactedBy && contactedAt ? (
          <p className="text-sm text-brand-navy">
            Contacted by {contactedBy} on {new Date(contactedAt).toLocaleDateString()}
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={marking}
              onClick={handleMarkContacted}
              className="border border-brand-navy px-4 py-2 text-brand-navy disabled:opacity-60"
            >
              {marking ? "Saving…" : "Mark as contacted"}
            </button>
            {markError && <p className="text-sm text-brand-red">{markError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RedLinesApplicationDetail({
  application,
}: {
  application: Application;
}) {
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decided, setDecided] = useState<"approved" | "rejected" | null>(null);

  const isDecided = application.status !== "pending";

  async function handleApprove() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/red-lines/approve/${application.id}`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Approve failed");
      setDecided("approved");
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
      const response = await fetch(`/api/admin/red-lines/reject/${application.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewerNotes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Reject failed");
      setDecided("rejected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setBusy(false);
    }
  }

  if (decided) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-12">
        <h1 className="font-sans text-3xl text-brand-black">
          {decided === "approved" ? "Approved" : "Rejected"}
        </h1>
        <p className="text-brand-black/80">
          {application.name ?? application.email}&apos;s status is now{" "}
          {decided}. Their answers stay here as the working group&apos;s
          record.
        </p>
        {application.email && (
          <EmailByHand
            applicationId={application.id}
            email={application.email}
            outcome={decided}
            contactedBy={null}
            contactedAt={null}
          />
        )}
        <Link href="/admin/red-lines-dialogue" className="underline">
          Back to pending Red Lines Dialogues applications
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-sans text-3xl text-brand-black">
          {application.name ?? "Unnamed applicant"}
        </h1>
        <div className="flex flex-shrink-0 gap-2">
          {application.areaOfExpertise && (
            <span className="border border-brand-navy px-2 py-1 text-xs uppercase text-brand-navy">
              {AREA_LABELS[application.areaOfExpertise]}
            </span>
          )}
          <span
            className={`border px-2 py-1 text-xs uppercase ${
              application.authProvider === "email"
                ? "border-brand-red text-brand-red"
                : "border-brand-navy text-brand-navy"
            }`}
          >
            {application.authProvider === "email" ? "Email only" : application.authProvider}
          </span>
        </div>
      </div>

      {application.authProvider === "linkedin" && (
        <p className="border border-brand-navy bg-brand-navy/5 px-4 py-3 text-brand-navy">
          Signed in with LinkedIn. That confirms they control a LinkedIn
          account with this name and email. It does not confirm they own the
          profile linked below, if given: that URL is typed by the applicant,
          and anyone can open a new LinkedIn account in someone else&apos;s
          name.
        </p>
      )}

      {application.authProvider === "google" && (
        <p className="border border-brand-navy bg-brand-navy/5 px-4 py-3 text-brand-navy">
          Signed in with Google, no LinkedIn OAuth. Apply extra scrutiny to
          the identity signals below.
        </p>
      )}

      {application.authProvider === "email" && (
        <p className="border border-brand-red bg-brand-red/10 px-4 py-3 text-brand-red">
          No identity verification. They confirmed they can read mail at this
          address, and nothing else: the name is whatever they typed. Treat
          as unverified until independently confirmed.
        </p>
      )}

      {isDecided && (
        <>
          <div className="border border-brand-black/15 bg-brand-black/5 px-4 py-3">
            <p className="text-brand-black">
              {application.status === "approved" ? "Approved" : "Rejected"}
              {application.reviewedAt &&
                ` on ${new Date(application.reviewedAt).toLocaleDateString()}`}
              {application.reviewedBy && ` by ${application.reviewedBy}`}.
            </p>
            {application.reviewerNotes && (
              <p className="mt-1 text-brand-black/80">
                {application.reviewerNotes}
              </p>
            )}
          </div>
          {application.email && (
            <EmailByHand
              applicationId={application.id}
              email={application.email}
              outcome={application.status as "approved" | "rejected"}
              contactedBy={application.contactedBy}
              contactedAt={application.contactedAt}
            />
          )}
        </>
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

      {application.affiliation && (
        <DetailField label="Affiliation">
          <p className="text-brand-black/80">{application.affiliation}</p>
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

      {application.motivation && (
        <DetailField label="Motivation">
          <p className="whitespace-pre-wrap text-brand-black/80">
            {application.motivation}
          </p>
        </DetailField>
      )}

      <DetailField label="Available hours, October–December 2026">
        <p className="text-brand-black/80">
          {application.availableHours ?? "Not given"}
        </p>
      </DetailField>

      <DetailField label="Meeting availability">
        <ul className="text-brand-black/80">
          <li>12 October 2026: {application.availableOct12 ? "Yes" : "No"}</li>
          <li>9 November 2026: {application.availableNov9 ? "Yes" : "No"}</li>
          <li>7 December 2026: {application.availableDec7 ? "Yes" : "No"}</li>
        </ul>
      </DetailField>

      {application.euParliamentInterest && (
        <DetailField label="Interested in visiting the European Parliament (Q1 2027)">
          <p className="text-brand-black/80">
            {EU_INTEREST_LABELS[application.euParliamentInterest]}
          </p>
        </DetailField>
      )}

      {application.publicationExample && (
        <DetailField label="Example of relevant publication">
          <p className="whitespace-pre-wrap text-brand-black/80">
            {application.publicationExample}
          </p>
        </DetailField>
      )}

      {!isDecided && (
        <label className="flex flex-col gap-1">
          <span className="font-sans text-xl text-brand-black">
            Reviewer notes (internal only)
          </span>
          <span className="text-sm text-brand-black/60">
            Do not include names or other identifying details.
          </span>
          <textarea
            value={reviewerNotes}
            onChange={(event) => setReviewerNotes(event.target.value)}
            rows={4}
            className="border border-brand-black/30 bg-brand-white px-3 py-2"
          />
        </label>
      )}

      {error && <p className="text-brand-red">{error}</p>}

      {!isDecided && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={busy}
            onClick={handleApprove}
            className="bg-brand-navy px-5 py-2 text-brand-white disabled:opacity-60"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleReject}
            className="border border-brand-red px-5 py-2 text-brand-red disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      )}
    </main>
  );
}
