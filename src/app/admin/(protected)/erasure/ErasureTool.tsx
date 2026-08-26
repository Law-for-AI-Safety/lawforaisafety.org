"use client";

import { useState } from "react";
import type { ErasureFindings, ErasureResult, ErasureScopes } from "@/lib/erasure";

/**
 * Two-step by design: look up an address, see exactly what is held, then
 * delete. There is no single-click path, because the delete is permanent and
 * the operator should never be guessing what it will remove.
 *
 * Each holding is selected separately, because erasure is per purpose. "Delete
 * my application" and "unsubscribe me" are different requests, and honouring
 * one should not silently carry out the other.
 */
export default function ErasureTool() {
  const [email, setEmail] = useState("");
  const [findings, setFindings] = useState<ErasureFindings | null>(null);
  /** The address the findings belong to, so edits to the field invalidate them. */
  const [lookedUp, setLookedUp] = useState("");
  const [scopes, setScopes] = useState<ErasureScopes>({
    applications: true,
    newsletterSignups: true,
    processed: true,
  });
  const [result, setResult] = useState<ErasureResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(action: "lookup" | "erase") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/erasure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, action, scopes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Request failed");
      return data;
    } finally {
      setBusy(false);
    }
  }

  function toggle(key: keyof ErasureScopes) {
    setScopes((current) => ({ ...current, [key]: !current[key] }));
  }

  async function handleLookup() {
    setResult(null);
    setFindings(null);
    setScopes({ applications: true, newsletterSignups: true, processed: true });
    try {
      setFindings(await post("lookup"));
      setLookedUp(email.trim().toLowerCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    }
  }

  async function handleErase() {
    try {
      setResult(await post("erase"));
      setFindings(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erasure failed");
    }
  }

  const stale = findings !== null && email.trim().toLowerCase() !== lookedUp;
  const total = findings
    ? findings.applications.length +
      findings.newsletterSignups.length +
      (findings.processed ? 1 : 0)
    : 0;
  // Only offer to erase what is actually there, and only count a ticked box
  // as selected if it has something behind it.
  const selectedCount = findings
    ? (scopes.applications ? findings.applications.length : 0) +
      (scopes.newsletterSignups ? findings.newsletterSignups.length : 0) +
      (scopes.processed && findings.processed ? 1 : 0)
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="erasure-email" className="text-brand-black/70">
          Email address
        </label>
        <div className="flex flex-row gap-3">
          <input
            id="erasure-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && email.trim()) handleLookup();
            }}
            placeholder="person@example.com"
            className="flex-1 rounded-sm border border-brand-black/20 px-3 py-2"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={handleLookup}
            disabled={busy || !email.trim()}
            className="rounded-sm bg-brand-navy px-4 py-2 text-brand-white disabled:opacity-50"
          >
            {busy ? "Working…" : "Look up"}
          </button>
        </div>
        <p className="text-sm text-brand-black/50">
          Verify the requester controls this address before erasing anything —
          a reply from the address itself, or a code you send to it. Never act
          on an address supplied by someone else.
        </p>
      </div>

      {error && (
        <p className="rounded-sm border border-brand-red/40 bg-brand-red/5 px-4 py-3 text-brand-black">
          {error}
        </p>
      )}

      {findings && (
        <div className="flex flex-col gap-4 rounded-sm border border-brand-black/15 px-5 py-4">
          <h2 className="text-xl font-light text-brand-black">
            {total === 0 ? "Nothing held for this address" : "Held for this address"}
          </h2>

          {total === 0 ? (
            <p className="text-brand-black/70">
              No application, newsletter signup, or decision record matches. If
              they were rejected or approved and later erased, this is the
              expected result.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-brand-black/60">
                Tick only what they asked you to erase.
              </p>

              {findings.applications.length > 0 && (
                <label className="flex items-start gap-3 text-brand-black/80">
                  <input
                    type="checkbox"
                    checked={scopes.applications}
                    onChange={() => toggle("applications")}
                    className="mt-1.5"
                  />
                  <span>
                    {findings.applications.map((application) => (
                      <span key={application.id} className="block">
                        Application ({application.status}), submitted{" "}
                        {new Date(application.createdAt).toLocaleDateString()}
                        {application.hasCv ? ", including an uploaded CV" : ""}
                      </span>
                    ))}
                  </span>
                </label>
              )}

              {findings.newsletterSignups.length > 0 && (
                <label className="flex items-start gap-3 text-brand-black/80">
                  <input
                    type="checkbox"
                    checked={scopes.newsletterSignups}
                    onChange={() => toggle("newsletterSignups")}
                    className="mt-1.5"
                  />
                  <span>
                    {findings.newsletterSignups.map((signup) => (
                      <span key={signup.id} className="block">
                        Newsletter signup from{" "}
                        {new Date(signup.createdAt).toLocaleDateString()}
                        {signup.confirmed ? ", confirmed" : ", never confirmed"}
                      </span>
                    ))}
                  </span>
                </label>
              )}

              {findings.processed && (
                <label className="flex items-start gap-3 text-brand-black/80">
                  <input
                    type="checkbox"
                    checked={scopes.processed}
                    onChange={() => toggle("processed")}
                    className="mt-1.5"
                  />
                  <span>
                    Decision record ({findings.processed.outcome}) from{" "}
                    {new Date(
                      findings.processed.processedAt,
                    ).toLocaleDateString()}
                    , held as a hash of the email
                    {findings.processed.hasReviewerNotes
                      ? ", with reviewer notes"
                      : ""}
                  </span>
                </label>
              )}
            </div>
          )}

          {findings.newsletterSignups.length > 0 && scopes.newsletterSignups && (
            <p className="rounded-sm border border-brand-red/30 bg-brand-red/5 px-4 py-3 text-sm text-brand-black/70">
              Delete the contact in Brevo too. This removes our record that
              they consented, so leaving them subscribed there means mailing
              someone with nothing to show consent was given. Erase both, or
              neither.
            </p>
          )}

          {total > 0 && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleErase}
                disabled={busy || stale || selectedCount === 0}
                className="self-start rounded-sm bg-brand-red px-4 py-2 text-brand-white disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Permanently delete selected"}
              </button>
              <p className="text-sm text-brand-black/50">
                {stale
                  ? "The address has changed since this lookup. Look it up again."
                  : selectedCount === 0
                    ? "Nothing selected."
                    : "This cannot be undone."}
              </p>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-2 rounded-sm border border-brand-black/15 px-5 py-4">
          <h2 className="text-xl font-light text-brand-black">Erased</h2>
          <p className="text-brand-black/80">
            Deleted {result.applications} application record(s), {result.cvs}{" "}
            CV file(s), {result.newsletterSignups} newsletter signup(s), and{" "}
            {result.processed} decision record(s).
          </p>
          <p className="text-sm text-brand-black/50">
            Remember to confirm back to the requester, and to remove them in
            Brevo if they were on the mailing list.
          </p>
        </div>
      )}
    </div>
  );
}
