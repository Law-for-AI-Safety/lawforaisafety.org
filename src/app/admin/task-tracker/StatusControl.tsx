"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { TASK_TRACKER_STATUSES, STATUS_LABELS, type TaskTrackerStatus } from "./status";
import { sendJson } from "./api";

/**
 * Shared by project and task detail pages — same PATCH-and-refresh shape,
 * different endpoint. `requireBlockedReason` defaults to true (tasks have a
 * blockedReason column); pass false for projects, which don't, so the
 * prompt never collects text the API would silently drop.
 *
 * Status saves the moment it's picked, unlike the rest of the task form —
 * the "Saves immediately" hint and the Saving…/Saved line say so, so nobody
 * hunts for a save button that isn't needed.
 */
export default function StatusControl({
  endpoint,
  status,
  blockedReason,
  requireBlockedReason = true,
}: {
  endpoint: string;
  status: TaskTrackerStatus;
  blockedReason?: string | null;
  requireBlockedReason?: boolean;
}) {
  const router = useRouter();
  const selectId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [reasonPrompt, setReasonPrompt] = useState<string | null>(null);
  // Shown while the PATCH and refresh are in flight, so the dropdown doesn't
  // snap back to the old value and look like the change was rejected.
  const [pending, setPending] = useState<TaskTrackerStatus | null>(null);

  async function submit(nextStatus: TaskTrackerStatus, reason?: string) {
    setPending(nextStatus);
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await sendJson(endpoint, "PATCH", {
        status: nextStatus,
        ...(reason !== undefined ? { blockedReason: reason } : {}),
      });
      setReasonPrompt(null);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setPending(null);
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function handleChange(nextStatus: TaskTrackerStatus) {
    setSaved(false);
    if (nextStatus === "blocked" && requireBlockedReason) {
      setReasonPrompt(blockedReason ?? "");
      return;
    }
    setReasonPrompt(null);
    submit(nextStatus);
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-56">
      <label htmlFor={selectId} className="flex items-baseline justify-between gap-2">
        <span className="font-sans text-brand-black">Status</span>
        <span className="text-sm text-brand-black/70">Saves immediately</span>
      </label>
      <select
        id={selectId}
        value={reasonPrompt !== null ? "blocked" : (pending ?? status)}
        disabled={busy}
        onChange={(event) => handleChange(event.target.value as TaskTrackerStatus)}
        className="border border-brand-black/30 bg-brand-white px-3 py-2 disabled:opacity-60"
      >
        {TASK_TRACKER_STATUSES.map((value) => (
          <option key={value} value={value}>
            {STATUS_LABELS[value]}
          </option>
        ))}
      </select>

      {reasonPrompt !== null && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (reasonPrompt.trim()) submit("blocked", reasonPrompt);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setReasonPrompt(null);
          }}
          className="flex flex-col gap-2 border border-brand-red/40 bg-brand-red/5 px-3 py-2"
        >
          <label className="flex flex-col gap-1">
            <span className="text-sm text-brand-black">
              What&apos;s blocking this? (required)
            </span>
            <input
              autoFocus
              required
              value={reasonPrompt}
              onChange={(event) => setReasonPrompt(event.target.value)}
              className="border border-brand-black/30 bg-brand-white px-3 py-2"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !reasonPrompt.trim()}
              className="bg-brand-navy px-4 py-1 text-brand-white disabled:opacity-60"
            >
              {busy ? "Saving…" : "Mark blocked"}
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
        </form>
      )}

      <p aria-live="polite" className="text-sm">
        {busy && reasonPrompt === null && <span className="text-brand-black/70">Saving…</span>}
        {saved && !busy && !error && <span className="text-brand-navy">Status saved.</span>}
        {error && <span className="text-brand-red">{error}</span>}
      </p>
    </div>
  );
}
