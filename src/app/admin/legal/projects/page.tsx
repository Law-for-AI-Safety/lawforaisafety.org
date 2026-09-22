import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { legalProjects } from "@/drizzle/schema";
import StatusBadge from "../StatusBadge";

export default async function ProjectsPage() {
  const projects = await db
    .select()
    .from(legalProjects)
    .orderBy(desc(legalProjects.createdAt));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="font-sans text-3xl text-brand-black">Projects</h1>
        <Link
          href="/admin/legal/projects/new"
          className="bg-brand-navy px-5 py-2 text-brand-white"
        >
          New project
        </Link>
      </div>

      {projects.length === 0 && (
        <p className="text-brand-black/60">No projects yet.</p>
      )}

      <ul className="flex flex-col divide-y divide-brand-black/10">
        {projects.map((project) => (
          <li key={project.id} className="py-4">
            <Link
              href={`/admin/legal/projects/${project.id}`}
              className="flex items-center justify-between gap-4"
            >
              <div>
                <p className="text-brand-black underline">{project.name}</p>
                {project.description && (
                  <p className="mt-1 line-clamp-1 text-sm text-brand-black/60">
                    {project.description}
                  </p>
                )}
              </div>
              <StatusBadge status={project.status} />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
