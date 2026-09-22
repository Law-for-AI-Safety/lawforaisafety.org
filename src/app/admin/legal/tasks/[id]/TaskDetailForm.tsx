"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import StatusBadge from "../../StatusBadge";
import type { LegalTaskStatus } from "../../status";

type Task = {
  id: string;
  name: string;
  description: string | null;
  resourceLinks: string[];
  assigneeEmail: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  notes: string | null;
};

type SiblingTask = { id: string; name: string; status: LegalTaskStatus };

export default function TaskDetailForm({
  task,
  siblingTasks,
  currentDependencyIds,
}: {
  task: Task;
  siblingTasks: SiblingTask[];
  currentDependencyIds: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState(task.name);
  const [description, setDescription] = useState(task.description ?? "");
  const [resourceLinks, setResourceLinks] = useState(task.resourceLinks.join("\n"));
  const [assigneeEmail, setAssigneeEmail] = useState(task.assigneeEmail ?? "");
  const [plannedStart, setPlannedStart] = useState(task.plannedStart ?? "");
  const [plannedEnd, setPlannedEnd] = useState(task.plannedEnd ?? "");
  const [actualStart, setActualStart] = useState(task.actualStart ?? "");
  const [actualEnd, setActualEnd] = useState(task.actualEnd ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [dependsOn, setDependsOn] = useState<ReadonlySet<string>>(
    new Set(currentDependencyIds),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggleDependency(id: string) {
    setDependsOn((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/admin/legal/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          resourceLinks: resourceLinks
            .split("\n")
            .map((link) => link.trim())
            .filter(Boolean),
          assigneeEmail: assigneeEmail || null,
          plannedStart: plannedStart || null,
          plannedEnd: plannedEnd || null,
          actualStart: actualStart || null,
          actualEnd: actualEnd || null,
          notes: notes || null,
          dependsOnTaskIds: [...dependsOn],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Save failed");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
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
        <span className="text-sm text-brand-black/60">One URL per line</span>
        <textarea
          value={resourceLinks}
          onChange={(event) => setResourceLinks(event.target.value)}
          rows={3}
          className="border border-brand-black/30 bg-brand-white px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-sans text-brand-black">Assignee email</span>
        <input
          type="email"
          value={assigneeEmail}
          onChange={(event) => setAssigneeEmail(event.target.value)}
          className="border border-brand-black/30 bg-brand-white px-3 py-2"
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="font-sans text-brand-black">Planned start</span>
          <input
            type="date"
            value={plannedStart}
            onChange={(event) => setPlannedStart(event.target.value)}
            className="border border-brand-black/30 bg-brand-white px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-sans text-brand-black">Planned end</span>
          <input
            type="date"
            value={plannedEnd}
            onChange={(event) => setPlannedEnd(event.target.value)}
            className="border border-brand-black/30 bg-brand-white px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-sans text-brand-black">Actual start</span>
          <input
            type="date"
            value={actualStart}
            onChange={(event) => setActualStart(event.target.value)}
            className="border border-brand-black/30 bg-brand-white px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-sans text-brand-black">Actual end</span>
          <input
            type="date"
            value={actualEnd}
            onChange={(event) => setActualEnd(event.target.value)}
            className="border border-brand-black/30 bg-brand-white px-3 py-2"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-sans text-brand-black">Notes</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          className="border border-brand-black/30 bg-brand-white px-3 py-2"
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className="font-sans text-brand-black">Depends on</span>
        {siblingTasks.length === 0 ? (
          <p className="text-sm text-brand-black/60">No other tasks in this project yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {siblingTasks.map((sibling) => (
              <li key={sibling.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`dep-${sibling.id}`}
                  checked={dependsOn.has(sibling.id)}
                  onChange={() => toggleDependency(sibling.id)}
                />
                <label htmlFor={`dep-${sibling.id}`} className="flex items-center gap-2">
                  {sibling.name}
                  <StatusBadge status={sibling.status} />
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-brand-red">{error}</p>}
      {saved && !error && <p className="text-brand-navy">Saved.</p>}

      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="w-fit bg-brand-navy px-5 py-2 text-brand-white disabled:opacity-60"
      >
        Save changes
      </button>
    </form>
  );
}
