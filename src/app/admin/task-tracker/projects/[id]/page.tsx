import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { taskTrackerProjects, taskTrackerTasks } from "@/drizzle/schema";
import { getAdminSession } from "@/lib/session";
import { getBlockedByDependencyTaskIds } from "@/lib/task-tracker-flow";
import { listPeople, type Person } from "@/lib/admin-people";
import StatusBadge from "../../StatusBadge";
import StatusControl from "../../StatusControl";
import DueDate from "../../DueDate";
import ProjectTimeline from "../../ProjectTimeline";
import { personLabel } from "../../people";
import EditProjectForm from "./EditProjectForm";
import MarkProjectDone from "./MarkProjectDone";

type TaskRow = typeof taskTrackerTasks.$inferSelect;

function TaskList({
  tasks,
  blockedByDependency,
  people,
}: {
  tasks: TaskRow[];
  blockedByDependency: Set<string>;
  people: Person[];
}) {
  return (
    <ul className="flex flex-col divide-y divide-brand-black/10">
      {tasks.map((task) => (
        <li key={task.id} className="py-4">
          {/* Badges drop below the name on phones — side by side they
              squeezed the task name into a narrow column. */}
          <Link
            href={`/admin/task-tracker/tasks/${task.id}`}
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div>
              <p className="text-brand-black underline">{task.name}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-brand-black/70">
                <span>{personLabel(task.assigneeEmail, people) ?? "Unassigned"}</span>
                {task.plannedEnd && (
                  <>
                    <span>·</span>
                    <DueDate
                      plannedEnd={task.plannedEnd}
                      status={task.status}
                      actualEnd={task.actualEnd}
                    />
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
              {blockedByDependency.has(task.id) && (
                <span className="border border-brand-navy/40 px-2 py-1 text-xs text-brand-navy">
                  Waiting on dependency
                </span>
              )}
              <StatusBadge status={task.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [project] = await db
    .select()
    .from(taskTrackerProjects)
    .where(eq(taskTrackerProjects.id, id));
  if (!project) notFound();

  const tasks = await db
    .select()
    .from(taskTrackerTasks)
    .where(eq(taskTrackerTasks.projectId, id))
    .orderBy(asc(taskTrackerTasks.createdAt));

  const [blockedByDependency, people, session] = await Promise.all([
    getBlockedByDependencyTaskIds(tasks.map((task) => task.id)),
    listPeople(),
    getAdminSession(),
  ]);

  // Finished work sinks into a collapsed group so the open tasks stay
  // scannable as a project grows; creation order is kept within each group.
  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const finishedTasks = tasks.filter((t) => t.status === "done" || t.status === "cancelled");
  const newTaskHref = `/admin/task-tracker/projects/${project.id}/tasks/new`;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:py-12">
      <Link href="/admin/task-tracker/projects" className="w-fit underline">
        ← All projects
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-sans text-3xl text-brand-black">{project.name}</h1>
          {project.description && (
            <p className="mt-2 text-brand-black/80">{project.description}</p>
          )}
          {project.ownerEmail && (
            <p className="mt-2 text-sm text-brand-black/70">
              Owner: {personLabel(project.ownerEmail, people)}
            </p>
          )}
          {project.plannedEnd && (
            <p className="mt-1 text-sm text-brand-black/70">
              <DueDate
                plannedEnd={project.plannedEnd}
                status={project.status}
                actualEnd={project.actualEnd}
              />
            </p>
          )}
        </div>
        <StatusControl
          endpoint={`/api/admin/task-tracker/projects/${project.id}`}
          status={project.status}
          requireBlockedReason={false}
        />
      </div>

      <EditProjectForm
        project={{
          id: project.id,
          name: project.name,
          description: project.description,
          ownerEmail: project.ownerEmail,
          plannedStart: project.plannedStart,
          plannedEnd: project.plannedEnd,
          actualStart: project.actualStart,
          actualEnd: project.actualEnd,
        }}
        people={people}
        currentUser={{ email: session?.email ?? "", name: session?.name ?? "" }}
      />

      {tasks.length > 0 && <ProjectTimeline tasks={tasks} />}

      <div className="flex items-center justify-between border-t border-brand-black/10 pt-6">
        <h2 className="font-sans text-xl text-brand-black">
          Tasks
          {tasks.length > 0 && (
            <span className="ml-2 text-base text-brand-black/70">
              {finishedTasks.filter((t) => t.status === "done").length}/{tasks.length} done
            </span>
          )}
        </h2>
        {tasks.length > 0 && (
          <Link href={newTaskHref} className="bg-brand-navy px-5 py-2 text-brand-white">
            New task
          </Link>
        )}
      </div>

      {tasks.length === 0 && (
        <div className="flex flex-col items-start gap-3 border border-brand-black/10 px-4 py-6">
          <p className="text-brand-black">This project has no tasks yet.</p>
          <p className="text-sm text-brand-black/70">
            Break the work into steps someone can pick up — for example
            &ldquo;Draft policy&rdquo;, &ldquo;Legal review&rdquo;, &ldquo;Publish&rdquo;.
          </p>
          <Link href={newTaskHref} className="bg-brand-navy px-5 py-2 text-brand-white">
            Add the first task
          </Link>
        </div>
      )}

      {tasks.length > 0 &&
        openTasks.length === 0 &&
        (project.status === "done" || project.status === "cancelled" ? (
          <p className="text-brand-black/70">Every task in this project is finished.</p>
        ) : (
          <MarkProjectDone projectId={project.id} />
        ))}

      <TaskList tasks={openTasks} blockedByDependency={blockedByDependency} people={people} />

      {finishedTasks.length > 0 && (
        <details className="border-t border-brand-black/10 pt-4">
          <summary className="cursor-pointer text-brand-black">
            Done and cancelled ({finishedTasks.length})
          </summary>
          <TaskList
            tasks={finishedTasks}
            blockedByDependency={blockedByDependency}
            people={people}
          />
        </details>
      )}
    </main>
  );
}
