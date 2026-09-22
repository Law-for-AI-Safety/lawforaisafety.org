import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { legalProjects, legalTasks } from "@/drizzle/schema";
import { getBlockedByDependencyTaskIds } from "@/lib/legal-flow";
import StatusBadge from "../../StatusBadge";
import StatusControl from "../../StatusControl";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [project] = await db
    .select()
    .from(legalProjects)
    .where(eq(legalProjects.id, id));
  if (!project) notFound();

  const tasks = await db
    .select()
    .from(legalTasks)
    .where(eq(legalTasks.projectId, id))
    .orderBy(asc(legalTasks.createdAt));

  const blockedByDependency = await getBlockedByDependencyTaskIds(
    tasks.map((task) => task.id),
  );

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <Link href="/admin/legal/projects" className="w-fit underline">
        ← All projects
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-sans text-3xl text-brand-black">{project.name}</h1>
          {project.description && (
            <p className="mt-2 text-brand-black/80">{project.description}</p>
          )}
          {project.ownerEmail && (
            <p className="mt-2 text-sm text-brand-black/60">Owner: {project.ownerEmail}</p>
          )}
        </div>
        <StatusControl
          endpoint={`/api/admin/legal/projects/${project.id}`}
          status={project.status}
          requireBlockedReason={false}
        />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-sans text-xl text-brand-black">Tasks</h2>
        <Link
          href={`/admin/legal/projects/${project.id}/tasks/new`}
          className="bg-brand-navy px-5 py-2 text-brand-white"
        >
          New task
        </Link>
      </div>

      {tasks.length === 0 && <p className="text-brand-black/60">No tasks yet.</p>}

      <ul className="flex flex-col divide-y divide-brand-black/10">
        {tasks.map((task) => (
          <li key={task.id} className="py-4">
            <Link
              href={`/admin/legal/tasks/${task.id}`}
              className="flex items-center justify-between gap-4"
            >
              <div>
                <p className="text-brand-black underline">{task.name}</p>
                {task.assigneeEmail && (
                  <p className="mt-1 text-sm text-brand-black/60">{task.assigneeEmail}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {blockedByDependency.has(task.id) && (
                  <span className="border border-brand-navy/40 px-2 py-1 text-xs text-brand-navy/80">
                    Waiting on dependency
                  </span>
                )}
                <StatusBadge status={task.status} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
