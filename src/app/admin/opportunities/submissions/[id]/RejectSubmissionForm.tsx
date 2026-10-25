"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "../../../api";

type RejectResult = { id: string; emailed: boolean; emailFailed: boolean };

export default function RejectSubmissionForm({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notify, setNotify] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reject(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await sendJson<RejectResult>(`/api/admin/opportunities/submissions/${id}/reject`, "POST", {
        notify,
        reason,
      });
      if (result.emailFailed) {
        window.alert("Rejected, but the email to the submitter failed to send. You may want to write to them yourself.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject the submission");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-fit underline">
        Reject…
      </button>
    );
  }

  return (
    <form onSubmit={reject} className="flex flex-col gap-3">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        <span>Email the submitter to say it won&apos;t be listed</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-sans text-brand-black">
          Reason (optional{notify ? ", included in the email" : ", kept here for the team"})
        </span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
          rows={3}
          className="border border-brand-black/30 bg-brand-white px-3 py-2"
        />
      </label>
      {error && <p className="text-brand-red">{error}</p>}
      <div className="flex gap-4">
        <button type="submit" disabled={busy} className="w-fit bg-brand-red px-5 py-2 text-brand-white disabled:opacity-60">
          {busy ? "Rejecting…" : "Reject submission"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
