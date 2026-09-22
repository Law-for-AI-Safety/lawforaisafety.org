"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendJson } from "../../api";

/** Shown once every task is finished but the project itself isn't marked Done. */
export default function MarkProjectDone({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markDone() {
    setBusy(true);
    setError(null);
    try {
      await sendJson(`/api/admin/task-tracker/projects/${projectId}`, "PATCH", {
        status: "done",
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3 border border-brand-navy/40 bg-brand-navy/5 px-4 py-3 text-brand-navy">
      <p>Every task in this project is finished. Is the project done too?</p>
      <button
        type="button"
        onClick={markDone}
        disabled={busy}
        className="bg-brand-navy px-5 py-2 text-brand-white disabled:opacity-60"
      >
        {busy ? "Saving…" : "Mark project Done"}
      </button>
      {error && <p className="text-sm text-brand-red">{error}</p>}
    </div>
  );
}
