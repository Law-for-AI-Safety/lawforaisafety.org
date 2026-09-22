import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { legalTasks, legalProjects, legalTaskDependencies } from "@/drizzle/schema";
import { getBlockedByDependencyTaskIds } from "@/lib/legal-flow";
import StatusControl from "../../StatusControl";
import TaskDetailForm from "./TaskDetailForm";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [task] = await db.select().from(legalTasks).where(eq(legalTasks.id, id));
  if (!task) notFound();

  const [project] = await db
    .select()
    .from(legalProjects)
    .where(eq(legalProjects.id, task.projectId));

  // Every other task in the same project is a candidate dependency —
  // cross-project dependencies aren't offered, to keep this legible.
  const siblingTasks = await db
    .select({ id: legalTasks.id, name: legalTasks.name, status: legalTasks.status })
    .from(legalTasks)
    .where(and(eq(legalTasks.projectId, task.projectId), ne(legalTasks.id, id)))
    .orderBy(asc(legalTasks.createdAt));

  const currentDependencies = await db
    .select({ dependsOnTaskId: legalTaskDependencies.dependsOnTaskId })
    .from(legalTaskDependencies)
    .where(eq(legalTaskDependencies.taskId, id));

  const blocked = await getBlockedByDependencyTaskIds([id]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      {project && (
        <Link href={`/admin/legal/projects/${project.id}`} className="w-fit underline">
          ← {project.name}
        </Link>
      )}

      <div className="flex items-start justify-between gap-4">
        <h1 className="font-sans text-3xl text-brand-black">{task.name}</h1>
        <StatusControl
          endpoint={`/api/admin/legal/tasks/${task.id}`}
          status={task.status}
          blockedReason={task.blockedReason}
        />
      </div>

      {task.status === "blocked" && task.blockedReason && (
        <p className="border border-brand-red bg-brand-red/10 px-4 py-3 text-brand-red">
          Blocked: {task.blockedReason}
        </p>
      )}

      {blocked.has(id) && (
        <p className="border border-brand-navy/40 bg-brand-navy/5 px-4 py-3 text-brand-navy">
          Waiting on at least one dependency that isn&apos;t Done yet.
        </p>
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
        currentDependencyIds={currentDependencies.map((d) => d.dependsOnTaskId)}
      />
    </main>
  );
}
