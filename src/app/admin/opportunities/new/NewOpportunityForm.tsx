"use client";

import { useState } from "react";
import { sendJson } from "../api";
import OpportunityFields, { emptyOpportunityForm, toOpportunityBody, type OpportunityFormState } from "../OpportunityFields";
import PublishedNotice from "../PublishedNotice";
import type { Opportunity } from "@/opportunities/types";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Opportunity | null>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await sendJson("/api/admin/opportunities", "POST", { ...toOpportunityBody(state), submissionId });
      setCreated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the opportunity");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="flex flex-col gap-3">
        <PublishedNotice opportunity={created} action="created" />
        {submissionId && <p className="text-brand-black/70">We&apos;ve emailed the submitter the link.</p>}
      </div>
    );
  }

  return (
    <form onSubmit={handleCreate} className="flex flex-col gap-4">
      <OpportunityFields state={state} setState={setState} tagSuggestions={tagSuggestions} />
      {error && <p className="text-brand-red">{error}</p>}
      <button
        type="submit"
        disabled={busy || !state.title.trim() || !state.org.trim() || !state.applyUrl.trim()}
        className="w-fit bg-brand-navy px-5 py-2 text-brand-white disabled:opacity-60"
      >
        {busy ? "Creating…" : "Create opportunity"}
      </button>
    </form>
  );
}
