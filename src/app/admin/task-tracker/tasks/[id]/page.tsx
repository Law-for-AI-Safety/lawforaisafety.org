import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { taskTrackerTasks, taskTrackerProjects } from "@/drizzle/schema";
import { getAdminSession } from "@/lib/session";
import { getDependencyEdges } from "@/lib/task-tracker-flow";
import { listPeople } from "@/lib/admin-people";
import { personLabel } from "../../people";
import StatusControl from "../../StatusControl";
import StatusBadge from "../../StatusBadge";
import DueDate from "../../DueDate";
import { formatDate } from "../../dates";
import TaskDetailForm from "./TaskDetailForm";

/**
 * Tasks that already wait on `taskId`, directly or through a chain. Picking
 * any of them as a dependency of `taskId` would create a loop where neither
 * could ever start, so the picker disables them.
 */
function findDependents(
  taskId: string,
  edges: { taskId: string; dependsOnTaskId: string }[],
): Set<string> {
  const dependentsOf = new Map<string, string[]>();
  for (const edge of edges) {
    dependentsOf.set(edge.dependsOnTaskId, [
      ...(dependentsOf.get(edge.dependsOnTaskId) ?? []),
      edge.taskId,
    ]);
  }
  const found = new Set<string>();
  const stack = [...(dependentsOf.get(taskId) ?? [])];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (found.has(current)) continue;
    found.add(current);
    stack.push(...(dependentsOf.get(current) ?? []));
  }
  return found;
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [task] = await db.select().from(taskTrackerTasks).where(eq(taskTrackerTasks.id, id));
  if (!task) notFound();

  const [project] = await db
    .select()
    .from(taskTrackerProjects)
    .where(eq(taskTrackerProjects.id, task.projectId));

  // Every other task in the same project is a candidate dependency —
  // cross-project dependencies aren't offered, to keep this legible.
  const projectTasks = await db
    .select({
      id: taskTrackerTasks.id,
      name: taskTrackerTasks.name,
      status: taskTrackerTasks.status,
      plannedEnd: taskTrackerTasks.plannedEnd,
      actualEnd: taskTrackerTasks.actualEnd,
    })
    .from(taskTrackerTasks)
    .where(eq(taskTrackerTasks.projectId, task.projectId))
    .orderBy(asc(taskTrackerTasks.createdAt));
  const siblingTasks = projectTasks.filter((sibling) => sibling.id !== id);

  const [edges, people, session] = await Promise.all([
    getDependencyEdges(projectTasks.map((t) => t.id)),
    listPeople(),
    getAdminSession(),
  ]);

  const currentDependencyIds = edges
    .filter((edge) => edge.taskId === id)
    .map((edge) => edge.dependsOnTaskId);
  // Same rule as getBlockedByDependencyTaskIds (Done or Cancelled = no longer
  // holding anything up), computed from rows already loaded so the banner
  // can name *what* to chase.
  const waitingOn = siblingTasks.filter(
    (sibling) =>
      currentDependencyIds.includes(sibling.id) &&
      sibling.status !== "done" &&
      sibling.status !== "cancelled",
  );
  const dependentIds = new Set(
    edges.filter((edge) => edge.dependsOnTaskId === id).map((edge) => edge.taskId),
  );
  const dependents = siblingTasks.filter((sibling) => dependentIds.has(sibling.id));

  const unavailableDependencies: Record<string, string> = {};
  for (const dependentId of findDependents(id, edges)) {
    unavailableDependencies[dependentId] = dependentIds.has(dependentId)
      ? "Can't pick: it's waiting on this task, so neither could start"
      : "Can't pick: it's waiting on this task via another task, so neither could start";
  }

  const resourceLinks = task.resourceLinks ?? [];
  const started = formatDate(task.actualStart);
  const finished = formatDate(task.actualEnd);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:py-12">
      {project && (
        <Link href={`/admin/task-tracker/projects/${project.id}`} className="w-fit underline">
          ← {project.name}
        </Link>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-sans text-3xl text-brand-black">{task.name}</h1>
          <div className="mt-2 flex flex-col gap-1 text-sm text-brand-black/70">
            {task.plannedEnd && (
              <DueDate
                plannedEnd={task.plannedEnd}
                status={task.status}
                actualEnd={task.actualEnd}
              />
            )}
            {(started || finished) && (
              <span>
                {started && `Started ${started}`}
                {started && finished && " · "}
                {finished && `Finished ${finished}`}
              </span>
            )}
            <span>{personLabel(task.assigneeEmail, people) ?? "Unassigned"}</span>
          </div>
        </div>
        <StatusControl
          endpoint={`/api/admin/task-tracker/tasks/${task.id}`}
          status={task.status}
          blockedReason={task.blockedReason}
        />
      </div>

      {task.status === "blocked" && task.blockedReason && (
        <p className="border border-brand-red bg-brand-red/10 px-4 py-3 text-brand-red">
          Blocked: {task.blockedReason}
        </p>
      )}

      {waitingOn.length > 0 && (
        <div className="border border-brand-navy/40 bg-brand-navy/5 px-4 py-3 text-brand-navy">
          <p>Waiting on {waitingOn.length === 1 ? "this task" : "these tasks"} to be Done:</p>
          <ul className="mt-2 flex flex-col gap-1">
            {waitingOn.map((dependency) => (
              <li key={dependency.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/task-tracker/tasks/${dependency.id}`} className="underline">
                  {dependency.name}
                </Link>
                <StatusBadge status={dependency.status} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {dependents.length > 0 && (
        <div className="border border-brand-black/10 px-4 py-3">
          <p className="text-brand-black">
            {task.status === "done" || task.status === "cancelled"
              ? "Finishing this unblocked:"
              : "Waiting on this task:"}
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {dependents.map((dependent) => (
              <li key={dependent.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/task-tracker/tasks/${dependent.id}`} className="underline">
                  {dependent.name}
                </Link>
                <StatusBadge status={dependent.status} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {resourceLinks.length > 0 && (
        <div>
          <h2 className="font-sans text-lg text-brand-black">Resources</h2>
          <ul className="mt-1 flex flex-col gap-1">
            {resourceLinks.map((link) => (
              <li key={link} className="break-all">
                {/* Free text from the form — only http(s) becomes a link, so
                    a pasted javascript: URL can't run on click. */}
                {/^https?:\/\//i.test(link) ? (
                  <a href={link} target="_blank" rel="noopener noreferrer" className="underline">
                    {link}
                  </a>
                ) : (
                  link
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <TaskDetailForm
        task={{
          id: task.id,
          name: task.name,
          description: task.description,
          resourceLinks: task.resourceLinks ?? [],
          assigneeEmail: task.assigneeEmail,
          plannedStart: task.plannedStart,
          plannedEnd: task.plannedEnd,
          actualStart: task.actualStart,
          actualEnd: task.actualEnd,
          notes: task.notes,
        }}
        siblingTasks={siblingTasks}
        currentDependencyIds={currentDependencyIds}
        unavailableDependencies={unavailableDependencies}
        people={people}
        currentUser={{ email: session?.email ?? "", name: session?.name ?? "" }}
      />
    </main>
  );
}
