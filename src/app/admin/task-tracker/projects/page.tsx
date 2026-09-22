import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { taskTrackerProjects, taskTrackerTasks } from "@/drizzle/schema";
import StatusBadge from "../StatusBadge";
import DueDate from "../DueDate";

export default async function ProjectsPage() {
  const projects = await db
    .select()
    .from(taskTrackerProjects)
    .orderBy(desc(taskTrackerProjects.createdAt));

  const tasks = await db
    .select({
      projectId: taskTrackerTasks.projectId,
      status: taskTrackerTasks.status,
    })
    .from(taskTrackerTasks);

  const progressByProject = new Map<string, { done: number; total: number }>();
  for (const task of tasks) {
    const current = progressByProject.get(task.projectId) ?? { done: 0, total: 0 };
    current.total += 1;
    if (task.status === "done") current.done += 1;
    progressByProject.set(task.projectId, current);
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:py-12">
      <div className="flex items-center justify-between">
        <h1 className="font-sans text-3xl text-brand-black">Projects</h1>
        <Link
          href="/admin/task-tracker/projects/new"
          className="bg-brand-navy px-5 py-2 text-brand-white"
        >
          New project
        </Link>
      </div>

      {projects.length === 0 && (
        <div className="flex flex-col gap-2 border border-brand-black/10 px-4 py-6">
          <p className="text-brand-black">No projects yet.</p>
          <p className="text-sm text-brand-black/70">
            A project is a piece of work with an end goal, like a policy to
            publish. Create one with &ldquo;New project&rdquo;, then break it into tasks.
          </p>
        </div>
      )}

      <ul className="flex flex-col divide-y divide-brand-black/10">
        {projects.map((project) => {
          const progress = progressByProject.get(project.id);
          return (
            <li key={project.id} className="py-4">
              <Link
                href={`/admin/task-tracker/projects/${project.id}`}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div>
                  <p className="text-brand-black underline">{project.name}</p>
                  {project.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-brand-black/70 sm:line-clamp-1">
                      {project.description}
                    </p>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-brand-black/70">
                    <span>
                      {progress ? `${progress.done}/${progress.total} tasks done` : "No tasks yet"}
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
                <div className="flex flex-shrink-0 items-center gap-2">
                  <StatusBadge status={project.status} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
