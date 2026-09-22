"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/legal/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          ownerEmail: ownerEmail || null,
          plannedStart: plannedStart || null,
          plannedEnd: plannedEnd || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to create project");
      router.push(`/admin/legal/projects/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-sans text-brand-black">Name</span>
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="border border-brand-black/30 bg-brand-white px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-sans text-brand-black">Description</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          className="border border-brand-black/30 bg-brand-white px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-sans text-brand-black">Owner email</span>
        <input
          type="email"
          value={ownerEmail}
          onChange={(event) => setOwnerEmail(event.target.value)}
          className="border border-brand-black/30 bg-brand-white px-3 py-2"
        />
      </label>

      <div className="flex gap-4">
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-sans text-brand-black">Planned start</span>
          <input
            type="date"
            value={plannedStart}
            onChange={(event) => setPlannedStart(event.target.value)}
            className="border border-brand-black/30 bg-brand-white px-3 py-2"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-sans text-brand-black">Planned end</span>
          <input
            type="date"
            value={plannedEnd}
            onChange={(event) => setPlannedEnd(event.target.value)}
            className="border border-brand-black/30 bg-brand-white px-3 py-2"
          />
        </label>
      </div>

      {error && <p className="text-brand-red">{error}</p>}

      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="w-fit bg-brand-navy px-5 py-2 text-brand-white disabled:opacity-60"
      >
        Create project
      </button>
    </form>
  );
}
