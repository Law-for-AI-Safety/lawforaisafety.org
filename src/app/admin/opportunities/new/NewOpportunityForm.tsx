"use client";

import { useState } from "react";
import { sendJson, type PublishedResult } from "../api";
import OpportunityFields, { emptyOpportunityForm, toOpportunityBody, type OpportunityFormState } from "../OpportunityFields";
import PublishedNotice from "../PublishedNotice";

export default function NewOpportunityForm() {
  const [url, setUrl] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [imported, setImported] = useState<PublishedResult | null>(null);

  const [state, setState] = useState<OpportunityFormState>(emptyOpportunityForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<PublishedResult | null>(null);

  async function handleImport(event: React.FormEvent) {
    event.preventDefault();
    setImportBusy(true);
    setImportError(null);
    try {
      const result = await sendJson("/api/admin/opportunities/import", "POST", { url });
      setImported(result);
      setUrl("");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to start the import");
    } finally {
      setImportBusy(false);
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await sendJson("/api/admin/opportunities", "POST", toOpportunityBody(state));
      setCreated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the opportunity");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3 border border-brand-black/20 p-4">
        <h2 className="font-sans text-xl text-brand-black">Import from a URL</h2>
        <p className="text-sm text-brand-black/70">
          Opens a pull request with just the source URL. Review and finish the listing from the pull request&apos;s diff before merging.
        </p>
        {imported ? (
          <PublishedNotice result={imported} verb="import this opportunity" />
        ) : (
          <form onSubmit={handleImport} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-1 flex-col gap-1">
              <span className="font-sans text-brand-black">Listing URL</span>
              <input
                required
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="border border-brand-black/30 bg-brand-white px-3 py-2"
              />
            </label>
            <button type="submit" disabled={importBusy || !url.trim()} className="bg-brand-navy px-5 py-2 text-brand-white disabled:opacity-60">
              {importBusy ? "Opening…" : "Import"}
            </button>
          </form>
        )}
        {importError && <p className="text-brand-red">{importError}</p>}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-sans text-xl text-brand-black">Or add one by hand</h2>
        {created ? (
          <PublishedNotice result={created} verb="add this opportunity" />
        ) : (
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <OpportunityFields state={state} setState={setState} />
            {error && <p className="text-brand-red">{error}</p>}
            <button
              type="submit"
              disabled={busy || !state.title.trim() || !state.org.trim() || !state.applyUrl.trim()}
              className="w-fit bg-brand-navy px-5 py-2 text-brand-white disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create opportunity"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
