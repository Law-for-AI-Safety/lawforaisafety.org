"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DependencyPicker, { type SiblingTask } from "../../../../DependencyPicker";
import DateField from "../../../../DateField";
import PersonPicker, { type Person } from "../../../../PersonPicker";
import { sendJson } from "../../../../api";
import {
  startSuggestionCopy,
  startsTooEarlyWarning,
  suggestStartAfterDependencies,
} from "../../../../planning";

export default function NewTaskForm({
  projectId,
  siblingTasks,
  people,
  currentUser,
}: {
  projectId: string;
  siblingTasks: SiblingTask[];
  people: Person[];
  currentUser: Person;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [resourceLinks, setResourceLinks] = useState("");
  const [assigneeEmail, setAssigneeEmail] = useState("");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [dependsOn, setDependsOn] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSuggestion = suggestStartAfterDependencies(
    siblingTasks.filter((sibling) => dependsOn.has(sibling.id)),
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await sendJson("/api/admin/task-tracker/tasks", "POST", {
        projectId,
        name,
        description: description || null,
        resourceLinks: resourceLinks
          .split("\n")
          .map((link) => link.trim())
          .filter(Boolean),
        assigneeEmail: assigneeEmail || null,
        plannedStart: plannedStart || null,
        plannedEnd: plannedEnd || null,
        dependsOnTaskIds: [...dependsOn],
      });
      router.push(`/admin/task-tracker/tasks/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
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
        <span className="font-sans text-brand-black">Resource links</span>
        <span className="text-sm text-brand-black/70">One URL per line</span>
        <textarea
          value={resourceLinks}
          onChange={(event) => setResourceLinks(event.target.value)}
          rows={3}
          className="border border-brand-black/30 bg-brand-white px-3 py-2"
        />
      </label>

      <PersonPicker
        label="Assignee"
        value={assigneeEmail}
        onChange={setAssigneeEmail}
        people={people}
        currentUser={currentUser}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          label="Planned start"
          value={plannedStart}
          onChange={setPlannedStart}
          presets={["today", "nextWeek"]}
          suggestion={startSuggestionCopy(startSuggestion)}
          warning={startsTooEarlyWarning(plannedStart, startSuggestion)}
        />
        <DateField
          label="Planned end"
          value={plannedEnd}
          onChange={setPlannedEnd}
          presets={["nextWeek", "twoWeeks", "endOfMonth"]}
        />
      </div>

      {siblingTasks.length > 0 && (
        <DependencyPicker
          siblingTasks={siblingTasks}
          selected={dependsOn}
          onChange={setDependsOn}
        />
      )}

      {error && <p className="text-brand-red">{error}</p>}

      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="w-fit bg-brand-navy px-5 py-2 text-brand-white disabled:opacity-60"
      >
        {busy ? "Creating…" : "Create task"}
      </button>
    </form>
  );
}
