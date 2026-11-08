"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "../api";
import OpportunityFields from "../OpportunityFields";
import { opportunityFormFromExisting, roundRowsInSavedOrder, toOpportunityBody, type OpportunityFormState } from "@/opportunities/form-state";
import PublishedNotice from "../PublishedNotice";
import type { Opportunity } from "@/opportunities/types";

const PRIMARY = "w-fit bg-brand-navy px-5 py-2 text-brand-white disabled:opacity-60";
const SECONDARY = "w-fit border border-brand-navy px-5 py-2 text-brand-navy disabled:opacity-60";

export default function EditOpportunityForm({
  opportunity,
  tagSuggestions = [],
}: {
  opportunity: Opportunity;
  tagSuggestions?: string[];
}) {
  const [state, setState] = useState<OpportunityFormState>(opportunityFormFromExisting(opportunity));
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ opportunity: Opportunity; action: "published" | "updated" } | null>(null);
  const router = useRouter();
  /** A draft stays open for more edits once saved, so it can still be published from here. */
  const [draftSaved, setDraftSaved] = useState(false);
  const isDraft = opportunity.status === "draft";

  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Opportunity | null>(null);

  async function save(publish: boolean) {
    setBusy(publish ? "publish" : "save");
    setError(null);
    setDraftSaved(false);
    try {
      const body = { ...toOpportunityBody(state), ...(publish && { status: "published" }) };
      const sentRounds = state.rounds;
      const result = await sendJson(`/api/admin/opportunities/${opportunity.slug}`, "PATCH", body);
      if (result.status === "draft") {
        setDraftSaved(true);
        // The form stays open: show the rounds in the order they were saved in, soonest closing
        // first, unless the admin has changed them since, which a reorder would overwrite.
        setState((s) => (s.rounds === sentRounds ? { ...s, rounds: roundRowsInSavedOrder(s.rounds, result.rounds ?? []) } : s));
        // The page's heading and the Remove prompt still name it as it was.
        router.refresh();
      } else {
        setSaved({ opportunity: result, action: isDraft ? "published" : "updated" });
        // The page around the form, and the header's drafts count, still show it as a draft.
        if (isDraft) router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : publish ? "Failed to publish the listing" : "Failed to save the changes");
    } finally {
      setBusy(null);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void save(false);
  }

  async function handleRemove() {
    const consequence = isDraft ? "This deletes the draft." : "This takes it off the site immediately.";
    if (!window.confirm(`Remove "${opportunity.title}"? ${consequence}`)) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      const result = await sendJson(`/api/admin/opportunities/${opportunity.slug}`, "DELETE");
      // A removed draft goes back to the list, where the refresh brings the header's drafts
      // count up to date. Refreshing this page instead would 404, now the listing is gone.
      if (isDraft) {
        router.push("/admin/opportunities");
        router.refresh();
        return;
      }
      setRemoved(result);
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Failed to remove the listing");
    } finally {
      setRemoveBusy(false);
    }
  }

  const incomplete = !state.title.trim() || !state.org.trim() || !state.applyUrl.trim();

  if (removed) {
    return <PublishedNotice opportunity={removed} action="removed" />;
  }

  return (
    <div className="flex flex-col gap-6">
      {saved ? (
        <PublishedNotice opportunity={saved.opportunity} action={saved.action} />
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <OpportunityFields state={state} setState={setState} tagSuggestions={tagSuggestions} />
          {error && <p className="text-brand-red">{error}</p>}
          {draftSaved && <p className="text-brand-black/70">Draft saved. It isn&apos;t on the site until you publish it.</p>}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={busy !== null || incomplete}
              className={isDraft ? SECONDARY : PRIMARY}
            >
              {busy === "save" ? "Saving…" : isDraft ? "Save draft" : "Save changes"}
            </button>
            {isDraft && (
              <button type="button" onClick={() => void save(true)} disabled={busy !== null || incomplete} className={PRIMARY}>
                {busy === "publish" ? "Publishing…" : "Publish"}
              </button>
            )}
          </div>
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
