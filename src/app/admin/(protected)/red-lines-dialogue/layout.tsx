import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { redLinesApplications } from "@/drizzle/schema";
import AdminRedLinesList from "./AdminRedLinesList";

/**
 * The review workspace for Red Lines Dialogues applications, separate from
 * the volunteer "Collaboration applications" workspace: same pending
 * pattern, own queue. See admin/(protected)/applications/layout.tsx.
 */
export default async function RedLinesApplicationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pending = await db
    .select({
      id: redLinesApplications.id,
      name: redLinesApplications.name,
      affiliation: redLinesApplications.affiliation,
      areaOfExpertise: redLinesApplications.areaOfExpertise,
      createdAt: redLinesApplications.createdAt,
    })
    .from(redLinesApplications)
    .where(eq(redLinesApplications.status, "pending"))
    .orderBy(asc(redLinesApplications.createdAt));

  return (
    <div className="flex min-h-full flex-1 flex-col overflow-hidden md:flex-row">
      <aside className="max-h-64 flex-shrink-0 overflow-y-auto border-b border-brand-black/10 md:max-h-none md:w-96 md:border-b-0 md:border-r">
        <h1 className="px-4 pt-6 text-2xl font-light text-brand-black">
          Red Lines Dialogues applications
        </h1>
        <a
          href="/red-lines-dialogue#apply"
          target="_blank"
          rel="noopener noreferrer"
          className="block px-4 pt-1 text-sm underline text-brand-black/70"
        >
          Inspect form ↗
        </a>
        <div className="mt-4">
          <AdminRedLinesList
            applications={pending.map((application) => ({
              id: application.id,
              name: application.name,
              affiliation: application.affiliation,
              areaOfExpertise: application.areaOfExpertise,
              createdAtLabel: application.createdAt.toLocaleDateString(),
            }))}
          />
        </div>
        <Link
          href="/admin/red-lines-dialogue/decided"
          className="block px-4 py-4 text-sm underline text-brand-black/70"
        >
          View decided applications →
        </Link>
      </aside>

      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
