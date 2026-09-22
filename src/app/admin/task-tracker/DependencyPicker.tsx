"use client";

import { useId, useRef, useState } from "react";
import StatusBadge from "./StatusBadge";
import type { TaskTrackerStatus } from "./status";
import { formatDate } from "./dates";

export type SiblingTask = {
  id: string;
  name: string;
  status: TaskTrackerStatus;
  plannedEnd: string | null;
  actualEnd: string | null;
};

/** "Ends Sat 26 Sept" / "Ended Mon 8 Sept" — when this dependency clears. */
function endLabel(task: SiblingTask): string | null {
  const finished = task.status === "done" || task.status === "cancelled";
  if (finished) {
    const ended = formatDate(task.actualEnd ?? task.plannedEnd);
    return ended && `Ended ${ended}`;
  }
  const due = formatDate(task.plannedEnd);
  return due && `Due to end ${due}`;
}

// Open work first — that's what people are usually linking to.
const STATUS_ORDER: Record<TaskTrackerStatus, number> = {
  in_progress: 0,
  blocked: 1,
  ready: 2,
  draft: 3,
  done: 4,
  cancelled: 5,
};

function dependencyNote(status: TaskTrackerStatus): string | null {
  if (status === "done") return "Done — no longer holding this up";
  if (status === "cancelled") return "Cancelled — no longer holding this up";
  return null;
}

/**
 * "Blocked by" editor: the chosen tasks as a list you can remove from, plus
 * a type-to-search box to add more. Replaces a checkbox per task, which made
 * the current choice hard to see and grew into a wall once a project had
 * many tasks. Follows the ARIA combobox pattern (arrow keys, Enter, Escape).
 *
 * `unavailable` maps task ids that can't be picked to the reason why —
 * the detail page uses it to rule out dependency loops.
 */
export default function DependencyPicker({
  siblingTasks,
  selected,
  onChange,
  unavailable,
}: {
  siblingTasks: SiblingTask[];
  selected: ReadonlySet<string>;
  onChange: (next: ReadonlySet<string>) => void;
  unavailable?: ReadonlyMap<string, string>;
}) {
  const listboxId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  if (siblingTasks.length === 0) {
    return (
      <p className="text-sm text-brand-black/70">
        No other tasks in this project yet, so there&apos;s nothing this can wait on.
      </p>
    );
  }

  const chosen = siblingTasks
    .filter((task) => selected.has(task.id))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  const needle = query.trim().toLowerCase();
  const options = siblingTasks
    .filter((task) => !selected.has(task.id))
    .filter((task) => !needle || task.name.toLowerCase().includes(needle))
    .sort((a, b) => {
      // Unpickable ones sink to the bottom so they don't sit in the way.
      const blockedDiff = Number(unavailable?.has(a.id)) - Number(unavailable?.has(b.id));
      return blockedDiff || STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    });
  const pickable = options.filter((task) => !unavailable?.has(task.id));
  const active = pickable[Math.min(activeIndex, pickable.length - 1)];

  function add(id: string) {
    onChange(new Set([...selected, id]));
    setQuery("");
    setActiveIndex(0);
    inputRef.current?.focus();
  }

  function remove(id: string) {
    const next = new Set(selected);
    next.delete(id);
    onChange(next);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (pickable.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      const current = Math.min(activeIndex, pickable.length - 1);
      setActiveIndex((current + step + pickable.length) % pickable.length);
    } else if (event.key === "Enter") {
      // Never submit the surrounding form from inside the search box.
      event.preventDefault();
      if (open && active) add(active.id);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  const everythingChosen = siblingTasks.every((task) => selected.has(task.id));

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-sans text-brand-black">Blocked by</p>
        <p className="text-sm text-brand-black/70">
          Tasks that must be Done before this one can start.
        </p>
      </div>

      {chosen.length === 0 ? (
        <p className="text-sm text-brand-black/70">
          Nothing — this task can start any time.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-brand-black/10 border border-brand-black/10">
          {chosen.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-brand-black">{task.name}</span>
                  <StatusBadge status={task.status} />
                </span>
                <span className="text-sm text-brand-black/70">
                  {[dependencyNote(task.status), endLabel(task)].filter(Boolean).join(" · ")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => remove(task.id)}
                aria-label={`Remove ${task.name}`}
                className="flex-shrink-0 underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {!everythingChosen && (
        <div className="relative flex flex-col gap-1">
          <label htmlFor={inputId} className="text-sm text-brand-black">
            Add a task it depends on
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            autoComplete="off"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={open && active ? `${listboxId}-${active.id}` : undefined}
            placeholder="Start typing a task name…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={handleKeyDown}
            className="border border-brand-black/30 bg-brand-white px-3 py-2"
          />
          {open && (
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Tasks in this project"
              className="absolute top-full right-0 left-0 z-10 max-h-72 overflow-y-auto border border-brand-black/30 bg-brand-white"
            >
              {options.length === 0 && (
                <li className="px-3 py-2 text-sm text-brand-black/70">
                  No tasks match &ldquo;{query}&rdquo;.
                </li>
              )}
              {options.map((task) => {
                const reason = unavailable?.get(task.id);
                const isActive = task.id === active?.id;
                return (
                  <li
                    key={task.id}
                    id={`${listboxId}-${task.id}`}
                    role="option"
                    aria-selected={isActive}
                    aria-disabled={reason ? true : undefined}
                    // mousedown, not click: keeps focus in the input so the
                    // blur-to-close doesn't fire first and swallow the pick.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      if (!reason) add(task.id);
                    }}
                    onMouseEnter={() => {
                      if (!reason) setActiveIndex(pickable.indexOf(task));
                    }}
                    className={`flex flex-col gap-1 px-3 py-2 ${
                      reason
                        ? "cursor-not-allowed text-brand-black/70"
                        : "cursor-pointer text-brand-black"
                    } ${isActive ? "bg-brand-navy/10" : ""}`}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      {task.name}
                      <StatusBadge status={task.status} />
                    </span>
                    <span className="text-sm">{reason ?? endLabel(task)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
