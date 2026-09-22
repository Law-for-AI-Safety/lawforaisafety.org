"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendJson } from "../../api";
import DateField from "../../DateField";
import PersonPicker, { type Person } from "../../PersonPicker";

export default function NewProjectForm({
  people,
  currentUser,
}: {
  people: Person[];
  currentUser: Person;
}) {
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
      const data = await sendJson("/api/admin/task-tracker/projects", "POST", {
        name,
        description: description || null,
        ownerEmail: ownerEmail || null,
        plannedStart: plannedStart || null,
        plannedEnd: plannedEnd || null,
      });
      router.push(`/admin/task-tracker/projects/${data.id}`);
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

      <PersonPicker
        label="Owner"
        value={ownerEmail}
        onChange={setOwnerEmail}
        people={people}
        currentUser={currentUser}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          label="Planned start"
          value={plannedStart}
          onChange={setPlannedStart}
          presets={["today", "nextWeek"]}
        />
        <DateField
          label="Planned end"
          value={plannedEnd}
          onChange={setPlannedEnd}
          presets={["twoWeeks", "endOfMonth"]}
        />
      </div>

      {error && <p className="text-brand-red">{error}</p>}

      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="w-fit bg-brand-navy px-5 py-2 text-brand-white disabled:opacity-60"
      >
        {busy ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
