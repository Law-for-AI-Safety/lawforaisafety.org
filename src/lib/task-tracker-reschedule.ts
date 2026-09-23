import { suggestStartAfterDependencies } from "@/app/admin/task-tracker/planning";
import { addDaysISO, daysBetween } from "@/app/admin/task-tracker/dates";
import type { TaskTrackerStatus } from "@/app/admin/task-tracker/status";

export type SchedulableTask = {
  id: string;
  name: string;
  status: TaskTrackerStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualEnd: string | null;
};

export type DependencyEdge = { taskId: string; dependsOnTaskId: string };

export type RescheduleProposal = {
  id: string;
  name: string;
  from: { plannedStart: string; plannedEnd: string | null };
  to: { plannedStart: string; plannedEnd: string | null };
};

export type ReschedulePlan = {
  /** Which way the changed task's end moved — decides the wording and the rule. */
  direction: "later" | "earlier";
  proposals: RescheduleProposal[];
};

/**
 * Work that's under way or finished keeps its dates: moving the planned
 * start of something already started would rewrite history, not the plan.
 */
function canReschedule(task: SchedulableTask): boolean {
  return (
    task.status !== "in_progress" &&
    task.status !== "done" &&
    task.status !== "cancelled" &&
    task.plannedStart !== null
  );
}

/** Every task downstream of `rootId`, in an order where dependencies come first. */
function downstreamInOrder(rootId: string, edges: DependencyEdge[]): string[] {
  const dependentsOf = new Map<string, string[]>();
  for (const edge of edges) {
    dependentsOf.set(edge.dependsOnTaskId, [
      ...(dependentsOf.get(edge.dependsOnTaskId) ?? []),
      edge.taskId,
    ]);
  }

  const reachable = new Set<string>();
  const stack = [...(dependentsOf.get(rootId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (reachable.has(id) || id === rootId) continue;
    reachable.add(id);
    stack.push(...(dependentsOf.get(id) ?? []));
  }

  // Kahn's algorithm over just the reachable part; the graph has no loops
  // (validateDependencies rejects them), so every task gets placed.
  const waitingOn = new Map<string, number>();
  for (const id of reachable) {
    waitingOn.set(
      id,
      edges.filter((edge) => edge.taskId === id && reachable.has(edge.dependsOnTaskId)).length,
    );
  }
  const ready = [...reachable].filter((id) => waitingOn.get(id) === 0);
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const dependent of dependentsOf.get(id) ?? []) {
      if (!reachable.has(dependent)) continue;
      const remaining = waitingOn.get(dependent)! - 1;
      waitingOn.set(dependent, remaining);
      if (remaining === 0) ready.push(dependent);
    }
  }
  return order;
}

/**
 * What to offer after `changedTaskId`'s planned end moved from
 * `previousEnd` to its current value (already saved in `tasks`). Nothing is
 * applied here — the person who made the change confirms first.
 *
 * - Later: a dependent that would now start before its dependencies end is
 *   pushed to the day after, the same rule as the "Use <date>" suggestion.
 *   Tasks with slack to absorb the slip are left alone.
 * - Earlier: dependents are offered the same number of days back, but never
 *   earlier than their other dependencies allow.
 *
 * Either way a task keeps its length, and the change flows on down the chain.
 */
export function planDependentReschedule(
  tasks: SchedulableTask[],
  edges: DependencyEdge[],
  changedTaskId: string,
  previousEnd: string | null,
): ReschedulePlan | null {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const root = byId.get(changedTaskId);
  if (!root || !root.plannedEnd) return null;
  // A finished task's dependents go by when it actually ended, not the plan.
  if (root.status === "done" || root.status === "cancelled") return null;
  if (previousEnd === root.plannedEnd) return null;

  const direction = previousEnd === null || root.plannedEnd > previousEnd ? "later" : "earlier";

  // Days each task has been pulled back, for the "earlier" rule.
  const pulledBack = new Map<string, number>();
  if (previousEnd !== null) pulledBack.set(root.id, daysBetween(root.plannedEnd, previousEnd));
  const moved = new Set<string>([root.id]);
  const planned = new Map(tasks.map((task) => [task.id, task]));
  const proposals: RescheduleProposal[] = [];

  for (const id of downstreamInOrder(root.id, edges)) {
    const task = byId.get(id);
    if (!task || !canReschedule(task)) continue;
    const dependencyIds = edges
      .filter((edge) => edge.taskId === id)
      .map((edge) => edge.dependsOnTaskId);
    // Only follow the change itself — an unrelated clash elsewhere in the
    // project isn't this edit's business.
    if (!dependencyIds.some((dependencyId) => moved.has(dependencyId))) continue;

    const suggestion = suggestStartAfterDependencies(
      dependencyIds.map((dependencyId) => planned.get(dependencyId)!).filter(Boolean),
    );
    if (!suggestion) continue;
    const start = task.plannedStart!;

    let newStart: string;
    if (direction === "later") {
      if (start >= suggestion.date) continue;
      newStart = suggestion.date;
    } else {
      const shift = Math.max(
        ...dependencyIds.map((dependencyId) => pulledBack.get(dependencyId) ?? 0),
      );
      const candidate = addDaysISO(start, -shift);
      newStart = candidate > suggestion.date ? candidate : suggestion.date;
      if (newStart >= start) continue;
      pulledBack.set(id, daysBetween(newStart, start));
    }

    const newEnd = task.plannedEnd
      ? addDaysISO(newStart, daysBetween(start, task.plannedEnd))
      : null;
    planned.set(id, { ...task, plannedStart: newStart, plannedEnd: newEnd });
    moved.add(id);
    proposals.push({
      id,
      name: task.name,
      from: { plannedStart: start, plannedEnd: task.plannedEnd },
      to: { plannedStart: newStart, plannedEnd: newEnd },
    });
  }

  return proposals.length > 0 ? { direction, proposals } : null;
}

/** Ids of every task downstream of `rootId` that may still be rescheduled. */
export function reschedulableDownstreamIds(
  tasks: SchedulableTask[],
  edges: DependencyEdge[],
  rootId: string,
): Set<string> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return new Set(
    downstreamInOrder(rootId, edges).filter((id) => {
      const task = byId.get(id);
      return task !== undefined && canReschedule(task);
    }),
  );
}
