import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { taskTrackerProjects, taskTrackerTasks } from "@/drizzle/schema";
import { getAdminSession } from "@/lib/session";
import { listPeople } from "@/lib/admin-people";
import NewTaskForm from "./NewTaskForm";

export default async function NewTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [project] = await db
    .select({ id: taskTrackerProjects.id, name: taskTrackerProjects.name })
    .from(taskTrackerProjects)
    .where(eq(taskTrackerProjects.id, id));
  if (!project) notFound();

  const siblingTasks = await db
    .select({
      id: taskTrackerTasks.id,
      name: taskTrackerTasks.name,
      status: taskTrackerTasks.status,
      plannedEnd: taskTrackerTasks.plannedEnd,
      actualEnd: taskTrackerTasks.actualEnd,
    })
    .from(taskTrackerTasks)
    .where(eq(taskTrackerTasks.projectId, id))
    .orderBy(asc(taskTrackerTasks.createdAt));
  const [people, session] = await Promise.all([listPeople(), getAdminSession()]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <Link href={`/admin/task-tracker/projects/${project.id}`} className="w-fit underline">
        ← {project.name}
      </Link>
      <h1 className="font-sans text-3xl text-brand-black">New task</h1>
      <NewTaskForm
        projectId={id}
        siblingTasks={siblingTasks}
        people={people}
        currentUser={{ email: session?.email ?? "", name: session?.name ?? "" }}
      />
    </main>
  );
}
