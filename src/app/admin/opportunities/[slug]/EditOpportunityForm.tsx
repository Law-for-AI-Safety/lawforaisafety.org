"use client";

import { useState } from "react";
import { sendJson, type PublishedResult } from "../api";
import OpportunityFields, { opportunityFormFromExisting, toOpportunityBody, type OpportunityFormState } from "../OpportunityFields";
import PublishedNotice from "../PublishedNotice";
import type { Opportunity } from "@/opportunities/types";

export default function EditOpportunityForm({ opportunity }: { opportunity: Opportunity }) {
  const [state, setState] = useState<OpportunityFormState>(opportunityFormFromExisting(opportunity));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<PublishedResult | null>(null);

  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<PublishedResult | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await sendJson(`/api/admin/opportunities/${opportunity.slug}`, "PATCH", toOpportunityBody(state));
      setSaved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the changes");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!window.confirm(`Open a pull request removing "${opportunity.title}"?`)) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      const result = await sendJson(`/api/admin/opportunities/${opportunity.slug}`, "DELETE");
      setRemoved(result);
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Failed to remove the listing");
    } finally {
      setRemoveBusy(false);
    }
  }

  if (removed) {
    return <PublishedNotice result={removed} verb="remove this listing" />;
  }

  return (
    <div className="flex flex-col gap-6">
      {saved ? (
        <PublishedNotice result={saved} verb="update this listing" />
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <OpportunityFields state={state} setState={setState} />
          {error && <p className="text-brand-red">{error}</p>}
          <button
            type="submit"
            disabled={busy || !state.title.trim() || !state.org.trim() || !state.applyUrl.trim()}
            className="w-fit bg-brand-navy px-5 py-2 text-brand-white disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </form>
      )}

      <div className="border-t border-brand-black/10 pt-6">
        {removeError && <p className="text-brand-red">{removeError}</p>}
        <button type="button" onClick={handleRemove} disabled={removeBusy} className="w-fit border border-brand-red px-5 py-2 text-brand-red disabled:opacity-60">
          {removeBusy ? "Opening…" : "Remove this listing"}
        </button>
      </div>
    </div>
  );
}
