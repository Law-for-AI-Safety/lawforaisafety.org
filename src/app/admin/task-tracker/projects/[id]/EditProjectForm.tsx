"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendJson } from "../../api";
import DateField from "../../DateField";
import PersonPicker, { type Person } from "../../PersonPicker";

type Project = {
  id: string;
  name: string;
  description: string | null;
  ownerEmail: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
};

type Fields = {
  name: string;
  description: string;
  ownerEmail: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string;
  actualEnd: string;
};

function fieldsFrom(project: Project): Fields {
  return {
    name: project.name,
    description: project.description ?? "",
    ownerEmail: project.ownerEmail ?? "",
    plannedStart: project.plannedStart ?? "",
    plannedEnd: project.plannedEnd ?? "",
    actualStart: project.actualStart ?? "",
    actualEnd: project.actualEnd ?? "",
  };
}

/**
 * Collapsed by default — editing a project is rare next to working its
 * tasks, so it shouldn't push the task list down the page. Fields are
 * (re)loaded from the latest saved values each time it opens, so dates the
 * server filled in on a status change are never shown stale.
 */
export default function EditProjectForm({
  project,
  people,
  currentUser,
}: {
  project: Project;
  people: Person[];
  currentUser: Person;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<Fields | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof Fields>(key: K) {
    return (value: Fields[K]) => setFields((current) => current && { ...current, [key]: value });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!fields) return;
    setBusy(true);
    setError(null);
    try {
      await sendJson(`/api/admin/task-tracker/projects/${project.id}`, "PATCH", {
        name: fields.name,
        description: fields.description || null,
        ownerEmail: fields.ownerEmail || null,
        plannedStart: fields.plannedStart || null,
        plannedEnd: fields.plannedEnd || null,
        actualStart: fields.actualStart || null,
        actualEnd: fields.actualEnd || null,
      });
      setFields(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!fields) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setFields(fieldsFrom(project));
        }}
        className="w-fit underline"
      >
        Edit project details
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 border border-brand-black/10 p-4"
    >
      <h2 className="font-sans text-xl text-brand-black">Edit project details</h2>

      <label className="flex flex-col gap-1">
        <span className="font-sans text-brand-black">Name</span>
        <input
          required
          value={fields.name}
          onChange={(event) => set("name")(event.target.value)}
          className="border border-brand-black/30 bg-brand-white px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-sans text-brand-black">Description</span>
        <textarea
          value={fields.description}
          onChange={(event) => set("description")(event.target.value)}
          rows={3}
          className="border border-brand-black/30 bg-brand-white px-3 py-2"
        />
      </label>

      <PersonPicker
        label="Owner"
        value={fields.ownerEmail}
        onChange={set("ownerEmail")}
        people={people}
        currentUser={currentUser}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          label="Planned start"
          value={fields.plannedStart}
          onChange={set("plannedStart")}
          presets={["today", "nextWeek"]}
        />
        <DateField
          label="Planned end"
          value={fields.plannedEnd}
          onChange={set("plannedEnd")}
          presets={["twoWeeks", "endOfMonth"]}
        />
        <DateField
          label="Actual start"
          value={fields.actualStart}
          onChange={set("actualStart")}
          presets={["today"]}
          hint="Filled in automatically when status first moves to In progress."
        />
        <DateField
          label="Actual end"
          value={fields.actualEnd}
          onChange={set("actualEnd")}
          presets={["today"]}
          hint="Filled in automatically when status moves to Done."
        />
      </div>

      {error && <p className="text-brand-red">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !fields.name.trim()}
          className="bg-brand-navy px-5 py-2 text-brand-white disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save project"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setFields(null)}
          className="underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
