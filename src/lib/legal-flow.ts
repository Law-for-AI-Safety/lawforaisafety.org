import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  legalProjects,
  legalTasks,
  legalTaskDependencies,
} from "@/drizzle/schema";
import { recordLegalAction } from "@/lib/legal-audit-log";

export class NotFoundError extends Error {}
export class ValidationError extends Error {}

type LegalTaskStatus = (typeof legalTasks.$inferInsert)["status"];

type ProjectRow = typeof legalProjects.$inferSelect;
type TaskRow = typeof legalTasks.$inferSelect;

function requireBlockedReason(
  status: LegalTaskStatus | undefined,
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
    .insert(legalProjects)
    .values({
      name: input.name,
      description: input.description,
      ownerEmail: input.ownerEmail,
      plannedStart: input.plannedStart,
      plannedEnd: input.plannedEnd,
      createdBy: input.createdBy,
    })
    .returning();
  await recordLegalAction({
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
    status: LegalTaskStatus;
    plannedStart: string | null;
    plannedEnd: string | null;
    actualStart: string | null;
    actualEnd: string | null;
  }>,
  actorEmail: string,
): Promise<ProjectRow> {
  const [row] = await db
    .update(legalProjects)
    .set(patch)
    .where(eq(legalProjects.id, id))
    .returning();
  if (!row) throw new NotFoundError();
  await recordLegalAction({
    actorEmail,
    action: "project_update",
    entityType: "project",
    entityId: row.id,
    detail: patch,
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
  createdBy: string;
}): Promise<TaskRow> {
  const [row] = await db
    .insert(legalTasks)
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
  await recordLegalAction({
    actorEmail: input.createdBy,
    action: "task_create",
    entityType: "task",
    entityId: row.id,
    detail: { name: row.name, projectId: row.projectId },
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
    status: LegalTaskStatus;
    blockedReason: string | null;
    plannedStart: string | null;
    plannedEnd: string | null;
    actualStart: string | null;
    actualEnd: string | null;
    notes: string | null;
    dependsOnTaskIds: string[];
  }>,
  actorEmail: string,
): Promise<TaskRow> {
  const [existing] = await db.select().from(legalTasks).where(eq(legalTasks.id, id));
  if (!existing) throw new NotFoundError();

  const blockedReason = requireBlockedReason(
    patch.status,
    patch.blockedReason,
    existing.blockedReason,
  );

  const { dependsOnTaskIds, ...fields } = patch;

  const row = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(legalTasks)
      .set({ ...fields, blockedReason })
      .where(eq(legalTasks.id, id))
      .returning();

    // Caller always sends the complete dependency list, not a diff — that's
    // what a multi-select in the UI naturally produces. Self-dependency is
    // silently dropped rather than erroring (the UI never offers a task as
    // its own dependency; only a hand-crafted request could send one).
    if (dependsOnTaskIds !== undefined) {
      const ids = [...new Set(dependsOnTaskIds)].filter(
        (dependsOnId) => dependsOnId !== id,
      );
      await tx
        .delete(legalTaskDependencies)
        .where(eq(legalTaskDependencies.taskId, id));
      if (ids.length > 0) {
        await tx
          .insert(legalTaskDependencies)
          .values(ids.map((dependsOnTaskId) => ({ taskId: id, dependsOnTaskId })));
      }
    }

    return updated;
  });

  await recordLegalAction({
    actorEmail,
    action: patch.status ? "task_status_change" : "task_update",
    entityType: "task",
    entityId: row.id,
    detail: patch,
  });
  return row;
}

/**
 * Task ids in `taskIds` that are still waiting on at least one dependency
 * that isn't Done. Computed at read time so it can never go stale — see
 * schema.ts's note on legalTaskDependencies.
 */
export async function getBlockedByDependencyTaskIds(
  taskIds: string[],
): Promise<Set<string>> {
  if (taskIds.length === 0) return new Set();
  const rows = await db
    .select({ taskId: legalTaskDependencies.taskId })
    .from(legalTaskDependencies)
    .innerJoin(
      legalTasks,
      eq(legalTaskDependencies.dependsOnTaskId, legalTasks.id),
    )
    .where(
      and(
        inArray(legalTaskDependencies.taskId, taskIds),
        ne(legalTasks.status, "done"),
      ),
    );
  return new Set(rows.map((r) => r.taskId));
}
