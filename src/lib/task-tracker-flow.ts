import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  taskTrackerProjects,
  taskTrackerTasks,
  taskTrackerTaskDependencies,
} from "@/drizzle/schema";
import { recordTaskTrackerAction } from "@/lib/task-tracker-audit-log";
import {
  planDependentReschedule,
  reschedulableDownstreamIds,
  type ReschedulePlan,
} from "@/lib/task-tracker-reschedule";

export class NotFoundError extends Error {}
export class ValidationError extends Error {}

type TaskTrackerStatus = (typeof taskTrackerTasks.$inferInsert)["status"];

type ProjectRow = typeof taskTrackerProjects.$inferSelect;
type TaskRow = typeof taskTrackerTasks.$inferSelect;

/** Today (UTC) as YYYY-MM-DD, for the automatic actual start/end dates. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Actual start/end follow status so nobody has to remember to fill them:
 * first move into In progress stamps the start, Done stamps the end, and
 * reopening a Done item clears the end again. Anything the caller sets
 * explicitly in the same request wins, and an existing start is never
 * overwritten.
 */
function automaticDates(
  existing: { status: TaskTrackerStatus; actualStart: string | null; actualEnd: string | null },
  patch: { status?: TaskTrackerStatus; actualStart?: string | null; actualEnd?: string | null },
): { actualStart?: string | null; actualEnd?: string | null } {
  const next = patch.status;
  if (!next || next === existing.status) return {};
  const dates: { actualStart?: string | null; actualEnd?: string | null } = {};
  if (next === "in_progress" && !existing.actualStart && patch.actualStart === undefined) {
    dates.actualStart = todayISO();
  }
  if (next === "done" && !existing.actualEnd && patch.actualEnd === undefined) {
    dates.actualEnd = todayISO();
  }
  if (
    existing.status === "done" &&
    next !== "done" &&
    next !== "cancelled" &&
    patch.actualEnd === undefined
  ) {
    dates.actualEnd = null;
  }
  return dates;
}

/**
 * Rejects dependency ids that aren't in the task's project, or that would
 * create a loop (A waits on B waits on A — neither could ever start).
 * `taskId` is null for a task being created, which can't be in a loop yet.
 */
async function validateDependencies(
  tx: Pick<typeof db, "select">,
  projectId: string,
  taskId: string | null,
  dependsOnTaskIds: string[],
): Promise<void> {
  if (dependsOnTaskIds.length === 0) return;

  const projectTaskIds = new Set(
    (
      await tx
        .select({ id: taskTrackerTasks.id })
        .from(taskTrackerTasks)
        .where(eq(taskTrackerTasks.projectId, projectId))
    ).map((row) => row.id),
  );
  if (dependsOnTaskIds.some((id) => !projectTaskIds.has(id))) {
    throw new ValidationError("A task can only depend on tasks in the same project");
  }
  if (!taskId) return;

  const edges = await tx
    .select()
    .from(taskTrackerTaskDependencies)
    .where(inArray(taskTrackerTaskDependencies.taskId, [...projectTaskIds]));
  const dependsOn = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.taskId === taskId) continue; // being replaced by this request
    dependsOn.set(edge.taskId, [...(dependsOn.get(edge.taskId) ?? []), edge.dependsOnTaskId]);
  }

  // Walk everything the new dependencies wait on; reaching taskId is a loop.
  const stack = [...dependsOnTaskIds];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === taskId) {
      throw new ValidationError(
        "That dependency would create a loop — one of those tasks is already waiting on this one",
      );
    }
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(dependsOn.get(current) ?? []));
  }
}

function requireBlockedReason(
  status: TaskTrackerStatus,
  blockedReason: string | null | undefined,
  existingReason: string | null | undefined,
): string | null {
  if (status !== "blocked") return null; // cleared when leaving blocked status
  const reason = blockedReason !== undefined ? blockedReason : existingReason;
  if (!reason || !reason.trim()) {
    throw new ValidationError("A reason is required when status is Blocked");
  }
  return reason.trim();
}

export async function createProject(input: {
  name: string;
  description: string | null;
  ownerEmail: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  createdBy: string;
}): Promise<ProjectRow> {
  const [row] = await db
    .insert(taskTrackerProjects)
    .values({
      name: input.name,
      description: input.description,
      ownerEmail: input.ownerEmail,
      plannedStart: input.plannedStart,
      plannedEnd: input.plannedEnd,
      createdBy: input.createdBy,
    })
    .returning();
  await recordTaskTrackerAction({
    actorEmail: input.createdBy,
    action: "project_create",
    entityType: "project",
    entityId: row.id,
    detail: { name: row.name },
  });
  return row;
}

export async function updateProject(
  id: string,
  patch: Partial<{
    name: string;
    description: string | null;
    ownerEmail: string | null;
    status: TaskTrackerStatus;
    plannedStart: string | null;
    plannedEnd: string | null;
    actualStart: string | null;
    actualEnd: string | null;
  }>,
  actorEmail: string,
): Promise<ProjectRow> {
  const [existing] = await db
    .select()
    .from(taskTrackerProjects)
    .where(eq(taskTrackerProjects.id, id));
  if (!existing) throw new NotFoundError();

  const values = { ...patch, ...automaticDates(existing, patch) };
  const [row] = await db
    .update(taskTrackerProjects)
    .set(values)
    .where(eq(taskTrackerProjects.id, id))
    .returning();
  if (!row) throw new NotFoundError();
  await recordTaskTrackerAction({
    actorEmail,
    action: "project_update",
    entityType: "project",
    entityId: row.id,
    detail: values,
  });
  return row;
}

export async function createTask(input: {
  projectId: string;
  name: string;
  description: string | null;
  resourceLinks: string[];
  assigneeEmail: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  dependsOnTaskIds: string[];
  createdBy: string;
}): Promise<TaskRow> {
  // Task and its dependencies land together: a separate follow-up request
  // could fail after the task exists, silently dropping the dependencies.
  const row = await db.transaction(async (tx) => {
    const ids = [...new Set(input.dependsOnTaskIds)];
    await validateDependencies(tx, input.projectId, null, ids);
    const [created] = await tx
      .insert(taskTrackerTasks)
      .values({
        projectId: input.projectId,
        name: input.name,
        description: input.description,
        resourceLinks: input.resourceLinks,
        assigneeEmail: input.assigneeEmail,
        plannedStart: input.plannedStart,
        plannedEnd: input.plannedEnd,
        createdBy: input.createdBy,
      })
      .returning();
    if (ids.length > 0) {
      await tx
        .insert(taskTrackerTaskDependencies)
        .values(ids.map((dependsOnTaskId) => ({ taskId: created.id, dependsOnTaskId })));
    }
    return created;
  });
  await recordTaskTrackerAction({
    actorEmail: input.createdBy,
    action: "task_create",
    entityType: "task",
    entityId: row.id,
    detail: {
      name: row.name,
      projectId: row.projectId,
      dependsOnTaskIds: input.dependsOnTaskIds,
    },
  });
  return row;
}

export async function updateTask(
  id: string,
  patch: Partial<{
    name: string;
    description: string | null;
    resourceLinks: string[];
    assigneeEmail: string | null;
    status: TaskTrackerStatus;
    blockedReason: string | null;
    plannedStart: string | null;
    plannedEnd: string | null;
    actualStart: string | null;
    actualEnd: string | null;
    notes: string | null;
    dependsOnTaskIds: string[];
  }>,
  actorEmail: string,
): Promise<{ task: TaskRow; reschedule: ReschedulePlan | null }> {
  const [existing] = await db.select().from(taskTrackerTasks).where(eq(taskTrackerTasks.id, id));
  if (!existing) throw new NotFoundError();

  // A patch without a status (the main task form) keeps the current one —
  // judging it as "not blocked" would wipe the reason on every save.
  const blockedReason = requireBlockedReason(
    patch.status ?? existing.status,
    patch.blockedReason,
    existing.blockedReason,
  );

  const { dependsOnTaskIds, ...fields } = patch;
  const values = { ...fields, ...automaticDates(existing, patch), blockedReason };

  const row = await db.transaction(async (tx) => {
    // Caller always sends the complete dependency list, not a diff — that's
    // what a multi-select in the UI naturally produces. Self-dependency is
    // silently dropped rather than erroring (the UI never offers a task as
    // its own dependency; only a hand-crafted request could send one).
    const dependencyIds =
      dependsOnTaskIds === undefined
        ? undefined
        : [...new Set(dependsOnTaskIds)].filter((dependsOnId) => dependsOnId !== id);
    if (dependencyIds) {
      await validateDependencies(tx, existing.projectId, id, dependencyIds);
    }

    const [updated] = await tx
      .update(taskTrackerTasks)
      .set(values)
      .where(eq(taskTrackerTasks.id, id))
      .returning();

    if (dependencyIds !== undefined) {
      const ids = dependencyIds;
      await tx
        .delete(taskTrackerTaskDependencies)
        .where(eq(taskTrackerTaskDependencies.taskId, id));
      if (ids.length > 0) {
        await tx
          .insert(taskTrackerTaskDependencies)
          .values(ids.map((dependsOnTaskId) => ({ taskId: id, dependsOnTaskId })));
      }
    }

    return updated;
  });

  await recordTaskTrackerAction({
    actorEmail,
    action: patch.status ? "task_status_change" : "task_update",
    entityType: "task",
    entityId: row.id,
    detail: { ...patch, ...automaticDates(existing, patch) },
  });

  // A moved end date may leave dependents starting too early (or with a
  // gap). Only proposed here — the form asks before anything else moves.
  const reschedule =
    patch.plannedEnd !== undefined && patch.plannedEnd !== existing.plannedEnd
      ? await loadProjectSchedule(row.projectId).then(({ tasks, edges }) =>
          planDependentReschedule(tasks, edges, row.id, existing.plannedEnd),
        )
      : null;

  return { task: row, reschedule };
}

async function loadProjectSchedule(projectId: string) {
  const tasks = await db
    .select()
    .from(taskTrackerTasks)
    .where(eq(taskTrackerTasks.projectId, projectId));
  const edges = await getDependencyEdges(tasks.map((task) => task.id));
  return { tasks, edges };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Applies the dates someone confirmed from a reschedule proposal. Only
 * tasks downstream of `taskId` that haven't started are accepted — this is
 * for following a dependency's change, not a general bulk edit.
 */
export async function rescheduleDependents(
  taskId: string,
  changes: { id: string; plannedStart: string; plannedEnd: string | null }[],
  actorEmail: string,
): Promise<number> {
  const [root] = await db.select().from(taskTrackerTasks).where(eq(taskTrackerTasks.id, taskId));
  if (!root) throw new NotFoundError();

  const { tasks, edges } = await loadProjectSchedule(root.projectId);
  const allowed = reschedulableDownstreamIds(tasks, edges, taskId);
  for (const change of changes) {
    if (!allowed.has(change.id)) {
      throw new ValidationError(
        "One of those tasks has changed since the suggestion was made. Reload and try again.",
      );
    }
    if (
      !ISO_DATE.test(change.plannedStart) ||
      (change.plannedEnd !== null && !ISO_DATE.test(change.plannedEnd)) ||
      (change.plannedEnd !== null && change.plannedEnd < change.plannedStart)
    ) {
      throw new ValidationError("Those dates don't make sense — reload and try again.");
    }
  }

  const byId = new Map(tasks.map((task) => [task.id, task]));
  await db.transaction(async (tx) => {
    for (const change of changes) {
      await tx
        .update(taskTrackerTasks)
        .set({ plannedStart: change.plannedStart, plannedEnd: change.plannedEnd })
        .where(eq(taskTrackerTasks.id, change.id));
    }
  });

  for (const change of changes) {
    const before = byId.get(change.id)!;
    await recordTaskTrackerAction({
      actorEmail,
      action: "task_reschedule",
      entityType: "task",
      entityId: change.id,
      detail: {
        plannedStart: change.plannedStart,
        plannedEnd: change.plannedEnd,
        previousPlannedStart: before.plannedStart,
        previousPlannedEnd: before.plannedEnd,
        followingTaskId: taskId,
      },
    });
  }
  return changes.length;
}

/**
 * Task ids in `taskIds` that are still waiting on at least one dependency
 * that isn't finished. Computed at read time so it can never go stale — see
 * schema.ts's note on taskTrackerTaskDependencies. A Cancelled dependency
 * counts as finished: the work isn't going to happen, so waiting on it
 * would hold the task up forever.
 */
export async function getBlockedByDependencyTaskIds(
  taskIds: string[],
): Promise<Set<string>> {
  if (taskIds.length === 0) return new Set();
  const rows = await db
    .select({ taskId: taskTrackerTaskDependencies.taskId })
    .from(taskTrackerTaskDependencies)
    .innerJoin(
      taskTrackerTasks,
      eq(taskTrackerTaskDependencies.dependsOnTaskId, taskTrackerTasks.id),
    )
    .where(
      and(
        inArray(taskTrackerTaskDependencies.taskId, taskIds),
        notInArray(taskTrackerTasks.status, ["done", "cancelled"]),
      ),
    );
  return new Set(rows.map((r) => r.taskId));
}

/** Every dependency edge among the given tasks (typically one project's). */
export async function getDependencyEdges(
  taskIds: string[],
): Promise<{ taskId: string; dependsOnTaskId: string }[]> {
  if (taskIds.length === 0) return [];
  return db
    .select()
    .from(taskTrackerTaskDependencies)
    .where(inArray(taskTrackerTaskDependencies.taskId, taskIds));
}
