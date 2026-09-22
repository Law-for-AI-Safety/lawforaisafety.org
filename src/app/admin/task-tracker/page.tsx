import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { taskTrackerProjects, taskTrackerTasks } from "@/drizzle/schema";
import { getAdminSession } from "@/lib/session";
import { getBlockedByDependencyTaskIds } from "@/lib/task-tracker-flow";
import StatusBadge from "./StatusBadge";
import DueDate from "./DueDate";
import { daysBetween, todayISO } from "./dates";

type MyTask = typeof taskTrackerTasks.$inferSelect & { projectName: string };

function TaskLines({
  tasks,
  blockedByDependency,
}: {
  tasks: MyTask[];
  blockedByDependency: Set<string>;
}) {
  return (
    <ul className="flex flex-col divide-y divide-brand-black/10">
      {tasks.map((task) => (
        <li key={task.id} className="py-3">
          <Link
            href={`/admin/task-tracker/tasks/${task.id}`}
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div>
              <p className="text-brand-black underline">{task.name}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-brand-black/70">
                <span>{task.projectName}</span>
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

function Group({
  title,
  description,
  tasks,
  blockedByDependency,
}: {
  title: string;
  description?: string;
  tasks: MyTask[];
  blockedByDependency: Set<string>;
}) {
  if (tasks.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-sans text-xl text-brand-black">
        {title} <span className="text-base text-brand-black/70">({tasks.length})</span>
      </h2>
      {description && <p className="text-sm text-brand-black/70">{description}</p>}
      <TaskLines tasks={tasks} blockedByDependency={blockedByDependency} />
    </section>
  );
}

/**
 * The tracker's front door: what the signed-in person is supposed to be
 * doing now, rather than the full project list. Everything is keyed off
 * their email as assignee or project owner — there are no accounts beyond
 * the shared admin login.
 */
export default async function MyWorkPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const email = session.email.toLowerCase();

  const myTasks = await db
    .select({
      task: taskTrackerTasks,
      projectName: taskTrackerProjects.name,
    })
    .from(taskTrackerTasks)
    .innerJoin(taskTrackerProjects, eq(taskTrackerTasks.projectId, taskTrackerProjects.id))
    .where(sql`lower(${taskTrackerTasks.assigneeEmail}) = ${email}`)
    .orderBy(asc(taskTrackerTasks.plannedEnd), asc(taskTrackerTasks.createdAt));

  const tasks: MyTask[] = myTasks.map((row) => ({ ...row.task, projectName: row.projectName }));
  const open = tasks.filter((task) => task.status !== "done" && task.status !== "cancelled");
  const blockedByDependency = await getBlockedByDependencyTaskIds(open.map((task) => task.id));

  const today = todayISO();
  const overdue = open.filter((task) => task.plannedEnd && task.plannedEnd < today);
  const blocked = open.filter((task) => task.status === "blocked" && !overdue.includes(task));
  const soon = open.filter(
    (task) =>
      !overdue.includes(task) &&
      !blocked.includes(task) &&
      task.plannedEnd &&
      daysBetween(today, task.plannedEnd) <= 7,
  );
  const rest = open.filter(
    (task) => !overdue.includes(task) && !blocked.includes(task) && !soon.includes(task),
  );

  // Projects they own, plus any project they have an open task in.
  const owned = await db
    .select()
    .from(taskTrackerProjects)
    .where(sql`lower(${taskTrackerProjects.ownerEmail}) = ${email}`)
    .orderBy(asc(taskTrackerProjects.plannedEnd));
  const involvedIds = [...new Set(open.map((task) => task.projectId))].filter(
    (id) => !owned.some((project) => project.id === id),
  );
  const involved =
    involvedIds.length > 0
      ? await db
          .select()
          .from(taskTrackerProjects)
          .where(inArray(taskTrackerProjects.id, involvedIds))
          .orderBy(asc(taskTrackerProjects.plannedEnd))
      : [];
  const projects = [...owned, ...involved];

  const firstName = session.name.split(" ")[0] || session.name;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-sans text-3xl text-brand-black">Your work, {firstName}</h1>
        <Link href="/admin/task-tracker/projects" className="underline">
          All projects
        </Link>
      </div>

      {open.length === 0 && (
        <div className="flex flex-col gap-2 border border-brand-black/10 px-4 py-6">
          <p className="text-brand-black">Nothing is assigned to you right now.</p>
          <p className="text-sm text-brand-black/70">
            Tasks show up here when someone puts your name in the Assignee field.
          </p>
        </div>
      )}

      <Group
        title="Overdue"
        tasks={overdue}
        blockedByDependency={blockedByDependency}
      />
      <Group
        title="Blocked"
        description="Waiting on something — worth a nudge if it's been a while."
        tasks={blocked}
        blockedByDependency={blockedByDependency}
      />
      <Group
        title="Due in the next week"
        tasks={soon}
        blockedByDependency={blockedByDependency}
      />
      <Group
        title="Everything else assigned to you"
        tasks={rest}
        blockedByDependency={blockedByDependency}
      />

      {projects.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-sans text-xl text-brand-black">Your projects</h2>
          <p className="text-sm text-brand-black/70">
            Projects you own, or where you have an open task.
          </p>
          <ul className="flex flex-col divide-y divide-brand-black/10">
            {projects.map((project) => (
              <li key={project.id} className="py-3">
                <Link
                  href={`/admin/task-tracker/projects/${project.id}`}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div>
                    <p className="text-brand-black underline">{project.name}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-brand-black/70">
                      <span>
                        {project.ownerEmail?.toLowerCase() === email
                          ? "You own this"
                          : "You have a task here"}
                      </span>
                      {project.plannedEnd && (
                        <>
                          <span>·</span>
                          <DueDate
                            plannedEnd={project.plannedEnd}
                            status={project.status}
                            actualEnd={project.actualEnd}
                          />
                        </>
                      )}
                    </p>
                  </div>
                  <StatusBadge status={project.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {projects.length === 0 && (
        <p className="text-sm text-brand-black/70">
          <Link href="/admin/task-tracker/projects" className="underline">
            Browse all projects
          </Link>{" "}
          to see what the team is working on.
        </p>
      )}
    </main>
  );
}
