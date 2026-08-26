import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, or } from "drizzle-orm";
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

  // Pending applications, plus already-decided ones stuck because their
  // notification email failed to send — those still need admin attention
  // (retry), so they belong in this list too, not just the truly pending.
  const pending = await db
    .select({
      id: applications.id,
      name: applications.name,
      organisation: applications.organisation,
      authProvider: applications.authProvider,
      createdAt: applications.createdAt,
      status: applications.status,
      notificationStatus: applications.notificationStatus,
    })
    .from(applications)
    .where(
      or(
        eq(applications.status, "pending"),
        and(
          or(
            eq(applications.status, "approved"),
            eq(applications.status, "rejected"),
          ),
          eq(applications.notificationStatus, "failed"),
        ),
      ),
    )
    .orderBy(asc(applications.createdAt));

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-brand-black/10 px-4 py-4">
        <span className="text-brand-black/70">Signed in as {session.email}</span>
        <div className="flex items-center gap-4">
          <Link href="/admin/erasure" className="underline">
            Erasure requests
          </Link>
          <Link href="/admin/email-preview" className="underline">
            Email preview
          </Link>
          <form action="/api/admin/logout" method="post">
            <button type="submit" className="underline">
              Log out
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-96 flex-shrink-0 overflow-y-auto border-r border-brand-black/10">
          <h1 className="px-4 pt-6 text-2xl font-light text-brand-black">
            Applications
          </h1>
          <div className="mt-4">
            <AdminApplicationsList
              applications={pending.map((application) => ({
                id: application.id,
                name: application.name,
                organisation: application.organisation,
                authProvider: application.authProvider,
                createdAtLabel: application.createdAt.toLocaleDateString(),
                needsNotificationRetry: application.notificationStatus === "failed",
              }))}
            />
          </div>
        </aside>

        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
