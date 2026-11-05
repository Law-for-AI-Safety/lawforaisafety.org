"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "../api";
import OpportunityFields from "../OpportunityFields";
import { emptyOpportunityForm, toOpportunityBody, type OpportunityFormState } from "@/opportunities/form-state";
import PublishedNotice from "../PublishedNotice";
import type { Opportunity, OpportunityStatus } from "@/opportunities/types";

export default function NewOpportunityForm({
  tagSuggestions = [],
  initial,
  submissionId,
}: {
  tagSuggestions?: string[];
  initial?: OpportunityFormState;
  /** Publishes this outside submission with the listing, which emails its submitter. */
  submissionId?: string;
}) {
  const [state, setState] = useState<OpportunityFormState>(initial ?? emptyOpportunityForm());
  const [busy, setBusy] = useState<OpportunityStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Opportunity | null>(null);
  const router = useRouter();

  async function create(status: OpportunityStatus) {
    setBusy(status);
    setError(null);
    try {
      const result = await sendJson("/api/admin/opportunities", "POST", { ...toOpportunityBody(state), status, submissionId });
      setCreated(result);
      // For the header's drafts count.
      if (result.status === "draft") router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the opportunity");
    } finally {
      setBusy(null);
    }
  }

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    void create("published");
  }

  const incomplete = !state.title.trim() || !state.org.trim() || !state.applyUrl.trim();

  if (created) {
    return (
      <div className="flex flex-col gap-3">
        <PublishedNotice opportunity={created} action={created.status === "draft" ? "drafted" : "created"} />
        {submissionId && <p className="text-brand-black/70">We&apos;ve emailed the submitter the link.</p>}
      </div>
    );
  }

  return (
    <form onSubmit={handleCreate} className="flex flex-col gap-4">
      <OpportunityFields state={state} setState={setState} tagSuggestions={tagSuggestions} />
      {error && <p className="text-brand-red">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy !== null || incomplete} className="w-fit bg-brand-navy px-5 py-2 text-brand-white disabled:opacity-60">
          {busy === "published" ? "Creating…" : "Create opportunity"}
        </button>
        {/* A submission's listing goes live at once, since its submitter is emailed the link. */}
        {!submissionId && (
          <button
            type="button"
            onClick={() => void create("draft")}
            disabled={busy !== null || incomplete}
            className="w-fit border border-brand-navy px-5 py-2 text-brand-navy disabled:opacity-60"
          >
            {busy === "draft" ? "Saving…" : "Save as draft"}
          </button>
        )}
      </div>
    </form>
  );
}
