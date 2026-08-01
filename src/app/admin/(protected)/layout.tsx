import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getAdminSession } from "@/lib/session";
import { db } from "@/lib/db";
import { applications } from "@/drizzle/schema";
import AdminApplicationsList from "./AdminApplicationsList";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const pending = await db
    .select({
      id: applications.id,
      name: applications.name,
      organisation: applications.organisation,
      authProvider: applications.authProvider,
      createdAt: applications.createdAt,
    })
    .from(applications)
    .where(eq(applications.status, "pending"))
    .orderBy(asc(applications.createdAt));

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-brand-black/10 px-4 py-4">
        <span className="text-brand-black/70">Signed in as {session.email}</span>
        <form action="/api/admin/logout" method="post">
          <button type="submit" className="underline">
            Log out
          </button>
        </form>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-96 flex-shrink-0 overflow-y-auto border-r border-brand-black/10">
          <h1 className="px-4 pt-6 text-2xl font-light text-brand-black">
            Pending applications
          </h1>
          <div className="mt-4">
            <AdminApplicationsList
              applications={pending.map((application) => ({
                ...application,
                createdAtLabel: application.createdAt.toLocaleDateString(),
              }))}
            />
          </div>
        </aside>

        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
