import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications } from "@/drizzle/schema";

export default async function AdminApplicationsListPage() {
  const pending = await db
    .select()
    .from(applications)
    .where(eq(applications.status, "pending"))
    .orderBy(asc(applications.createdAt));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-12">
      <h1 className="font-sans text-4xl text-brand-black">
        Pending applications
      </h1>

      {pending.length === 0 ? (
        <p className="text-brand-black/70">Nothing waiting for review.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-brand-black/10">
          {pending.map((application) => (
            <li key={application.id} className="py-4">
              <Link
                href={`/admin/applications/${application.id}`}
                className="flex items-center justify-between gap-4"
              >
                <div>
                  <p className="text-brand-black">
                    {application.name ?? "Unnamed applicant"}
                  </p>
                  <p className="text-sm text-brand-black/60">
                    {application.organisation ?? "No organisation given"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span
                    className={`border px-2 py-1 text-xs uppercase ${
                      application.authProvider === "email"
                        ? "border-brand-red text-brand-red"
                        : "border-brand-navy text-brand-navy"
                    }`}
                  >
                    {application.authProvider === "email"
                      ? "Unverified"
                      : application.authProvider}
                  </span>
                  <span className="text-sm text-brand-black/60">
                    {application.createdAt.toLocaleDateString()}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
