"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LEGAL_TASK_STATUSES, STATUS_LABELS, type LegalTaskStatus } from "./status";

/**
 * Shared by project and task detail pages — same PATCH-and-refresh shape,
 * different endpoint. `requireBlockedReason` defaults to true (tasks have a
 * blockedReason column); pass false for projects, which don't, so the
 * prompt never collects text the API would silently drop.
 */
export default function StatusControl({
  endpoint,
  status,
  blockedReason,
  requireBlockedReason = true,
}: {
  endpoint: string;
  status: LegalTaskStatus;
  blockedReason?: string | null;
  requireBlockedReason?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonPrompt, setReasonPrompt] = useState<string | null>(null);

  async function submit(nextStatus: LegalTaskStatus, reason?: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          ...(reason !== undefined ? { blockedReason: reason } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Update failed");
      setReasonPrompt(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function handleChange(nextStatus: LegalTaskStatus) {
    if (nextStatus === "blocked" && requireBlockedReason) {
      setReasonPrompt(blockedReason ?? "");
      return;
    }
    submit(nextStatus);
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        value={status}
        disabled={busy}
        onChange={(event) => handleChange(event.target.value as LegalTaskStatus)}
        className="border border-brand-black/30 bg-brand-white px-3 py-2 disabled:opacity-60"
      >
        {LEGAL_TASK_STATUSES.map((value) => (
          <option key={value} value={value}>
            {STATUS_LABELS[value]}
          </option>
        ))}
      </select>

      {reasonPrompt !== null && (
        <div className="flex flex-col gap-2 border border-brand-red/40 bg-brand-red/5 px-3 py-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-brand-black">Why is this blocked?</span>
            <input
              autoFocus
              value={reasonPrompt}
              onChange={(event) => setReasonPrompt(event.target.value)}
              className="border border-brand-black/30 bg-brand-white px-3 py-2"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !reasonPrompt.trim()}
              onClick={() => submit("blocked", reasonPrompt)}
              className="bg-brand-navy px-4 py-1 text-brand-white disabled:opacity-60"
            >
              Save
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setReasonPrompt(null)}
              className="px-4 py-1 underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-brand-red">{error}</p>}
    </div>
  );
}
