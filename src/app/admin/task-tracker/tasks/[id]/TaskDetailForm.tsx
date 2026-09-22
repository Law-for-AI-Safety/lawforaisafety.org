"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DependencyPicker, { type SiblingTask } from "../../DependencyPicker";
import DateField from "../../DateField";
import PersonPicker, { type Person } from "../../PersonPicker";
import { sendJson } from "../../api";
import { useServerValue } from "../../useServerValue";
import { formatDate } from "../../dates";
import type { ReschedulePlan } from "@/lib/task-tracker-reschedule";
import {
  startSuggestionCopy,
  startsTooEarlyWarning,
  suggestStartAfterDependencies,
} from "../../planning";

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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-4 border-0 border-t border-brand-black/10 p-0 pt-6 first:border-t-0 first:pt-0">
      <legend className="mb-1 p-0 font-sans text-lg text-brand-black">{title}</legend>
      {children}
    </fieldset>
  );
}

function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

export default function TaskDetailForm({
  task,
  siblingTasks,
  currentDependencyIds,
  unavailableDependencies,
  people,
  currentUser,
}: {
  task: Task;
  siblingTasks: SiblingTask[];
  currentDependencyIds: string[];
  /** Task id → why it can't be picked (would create a loop). */
  unavailableDependencies: Record<string, string>;
  people: Person[];
  currentUser: Person;
}) {
  const router = useRouter();
  const [name, setName] = useServerValue(task.name);
  const [description, setDescription] = useServerValue(task.description ?? "");
  const [resourceLinks, setResourceLinks] = useServerValue(task.resourceLinks.join("\n"));
  const [assigneeEmail, setAssigneeEmail] = useServerValue(task.assigneeEmail ?? "");
  const [plannedStart, setPlannedStart] = useServerValue(task.plannedStart ?? "");
  const [plannedEnd, setPlannedEnd] = useServerValue(task.plannedEnd ?? "");
  const [actualStart, setActualStart] = useServerValue(task.actualStart ?? "");
  const [actualEnd, setActualEnd] = useServerValue(task.actualEnd ?? "");
  const [notes, setNotes] = useServerValue(task.notes ?? "");
  const savedDependencies = useMemo(() => new Set(currentDependencyIds), [currentDependencyIds]);
  const [dependsOn, setDependsOn] = useServerValue<ReadonlySet<string>>(
    savedDependencies,
    sameIds,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Offered after a save that moved the planned end; nothing else moves
  // until the person confirms.
  const [reschedule, setReschedule] = useState<ReschedulePlan | null>(null);
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduledCount, setRescheduledCount] = useState<number | null>(null);

  const unavailable = useMemo(
    () => new Map(Object.entries(unavailableDependencies)),
    [unavailableDependencies],
  );

  // Recomputed as dependencies are ticked, before anything is saved.
  const startSuggestion = suggestStartAfterDependencies(
    siblingTasks.filter((sibling) => dependsOn.has(sibling.id)),
  );

  const dirty =
    name !== task.name ||
    description !== (task.description ?? "") ||
    resourceLinks !== task.resourceLinks.join("\n") ||
    assigneeEmail !== (task.assigneeEmail ?? "") ||
    plannedStart !== (task.plannedStart ?? "") ||
    plannedEnd !== (task.plannedEnd ?? "") ||
    actualStart !== (task.actualStart ?? "") ||
    actualEnd !== (task.actualEnd ?? "") ||
    notes !== (task.notes ?? "") ||
    !sameIds(dependsOn, savedDependencies);

  // Browser's own "Leave site?" prompt on refresh/close/back-to-another-site
  // while edits are unsaved. In-app link clicks aren't covered — the sticky
  // "Unsaved changes" label is the cue there.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Any edit clears the "Saved." confirmation from the last save.
  function edit<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setSaved(false);
    };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    setReschedule(null);
    setRescheduledCount(null);
    try {
      const data = await sendJson<{ reschedule: ReschedulePlan | null }>(
        `/api/admin/task-tracker/tasks/${task.id}`,
        "PATCH",
        {
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
        },
      );
      setSaved(true);
      setReschedule(data.reschedule);
      setRescheduleError(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function applyReschedule(plan: ReschedulePlan) {
    setRescheduleBusy(true);
    setRescheduleError(null);
    try {
      const data = await sendJson<{ count: number }>(
        `/api/admin/task-tracker/tasks/${task.id}/reschedule-dependents`,
        "POST",
        {
          changes: plan.proposals.map((proposal) => ({ id: proposal.id, ...proposal.to })),
        },
      );
      setReschedule(null);
      setRescheduledCount(data.count);
      router.refresh();
    } catch (err) {
      setRescheduleError(err instanceof Error ? err.message : "Reschedule failed");
    } finally {
      setRescheduleBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 pb-20">
      <Section title="Details">
        <label className="flex flex-col gap-1">
          <span className="font-sans text-brand-black">Name</span>
          <input
            required
            value={name}
            onChange={(event) => edit(setName)(event.target.value)}
            className="border border-brand-black/30 bg-brand-white px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-sans text-brand-black">Description</span>
          <textarea
            value={description}
            onChange={(event) => edit(setDescription)(event.target.value)}
            rows={3}
            className="border border-brand-black/30 bg-brand-white px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-sans text-brand-black">Resource links</span>
          <span className="text-sm text-brand-black/70">One URL per line</span>
          <textarea
            value={resourceLinks}
            onChange={(event) => edit(setResourceLinks)(event.target.value)}
            rows={3}
            className="border border-brand-black/30 bg-brand-white px-3 py-2"
          />
        </label>

        <PersonPicker
          label="Assignee"
          value={assigneeEmail}
          onChange={edit(setAssigneeEmail)}
          people={people}
          currentUser={currentUser}
        />
      </Section>

      <Section title="Schedule">
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField
            label="Planned start"
            value={plannedStart}
            onChange={edit(setPlannedStart)}
            presets={["today", "nextWeek"]}
            suggestion={startSuggestionCopy(startSuggestion)}
            warning={startsTooEarlyWarning(plannedStart, startSuggestion)}
          />
          <DateField
            label="Planned end"
            value={plannedEnd}
            onChange={edit(setPlannedEnd)}
            presets={["nextWeek", "twoWeeks", "endOfMonth"]}
          />
          <DateField
            label="Actual start"
            value={actualStart}
            onChange={edit(setActualStart)}
            presets={["today"]}
            hint="Filled in automatically when status first moves to In progress."
          />
          <DateField
            label="Actual end"
            value={actualEnd}
            onChange={edit(setActualEnd)}
            presets={["today"]}
            hint="Filled in automatically when status moves to Done."
          />
        </div>
      </Section>

      <Section title="Dependencies">
        <DependencyPicker
          siblingTasks={siblingTasks}
          selected={dependsOn}
          onChange={edit(setDependsOn)}
          unavailable={unavailable}
        />
      </Section>

      <Section title="Notes">
        <textarea
          aria-label="Notes"
          value={notes}
          onChange={(event) => edit(setNotes)(event.target.value)}
          rows={3}
          className="border border-brand-black/30 bg-brand-white px-3 py-2"
        />
      </Section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-brand-black/10 bg-brand-white px-4 py-3">
        {reschedule && (
          <ReschedulePanel
            plan={reschedule}
            busy={rescheduleBusy}
            error={rescheduleError}
            onApply={() => applyReschedule(reschedule)}
            onDismiss={() => setReschedule(null)}
          />
        )}
        <button
          type="submit"
          disabled={busy || !name.trim() || !dirty}
          className="bg-brand-navy px-5 py-2 text-brand-white disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
        <p aria-live="polite" className="text-sm">
          {dirty && !busy && !error && <span className="text-brand-black/70">Unsaved changes</span>}
          {error && <span className="text-brand-red">{error}</span>}
          {saved && !error && !dirty && (
            <span className="text-brand-navy">
              Saved.
              {rescheduledCount !== null &&
                ` Rescheduled ${rescheduledCount} ${rescheduledCount === 1 ? "task" : "tasks"} waiting on this one.`}
            </span>
          )}
        </p>
      </div>
    </form>
  );
}

function dateRange(dates: { plannedStart: string; plannedEnd: string | null }): string {
  const start = formatDate(dates.plannedStart);
  return dates.plannedEnd ? `${start} – ${formatDate(dates.plannedEnd)}` : `from ${start}`;
}

function ReschedulePanel({
  plan,
  busy,
  error,
  onApply,
  onDismiss,
}: {
  plan: ReschedulePlan;
  busy: boolean;
  error: string | null;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const count = plan.proposals.length;
  const tasks = count === 1 ? "1 task" : `${count} tasks`;
  const them = count === 1 ? "it" : "them";
  return (
    <div
      role="status"
      className="mb-2 flex w-full flex-col gap-2 border border-brand-navy/40 bg-brand-navy/5 px-3 py-2 text-brand-navy"
    >
      <p>
        {plan.direction === "later"
          ? `This now ends later, so ${tasks} waiting on it would start before it finishes. Move ${them} later?`
          : `This now ends earlier. Move the ${tasks} waiting on it earlier too?`}
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {plan.proposals.map((proposal) => (
          <li key={proposal.id}>
            <span className="text-brand-black">{proposal.name}</span>: {dateRange(proposal.from)}{" "}
            → {dateRange(proposal.to)}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onApply}
          disabled={busy}
          className="bg-brand-navy px-4 py-1 text-brand-white disabled:opacity-60"
        >
          {busy ? "Rescheduling…" : `Move ${them} ${plan.direction}`}
        </button>
        <button type="button" onClick={onDismiss} disabled={busy} className="px-4 py-1 underline">
          Leave as is
        </button>
      </div>
      {error && <p className="text-sm text-brand-red">{error}</p>}
    </div>
  );
}
