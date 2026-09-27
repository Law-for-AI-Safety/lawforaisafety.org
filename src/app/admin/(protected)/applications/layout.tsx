import { and, asc, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications } from "@/drizzle/schema";
import AdminApplicationsList from "./AdminApplicationsList";

/**
 * The review workspace: the queue beside the application being read. It
 * lives here rather than in the admin layout so /admin can be a summary of
 * everything, not just this one job.
 */
export default async function ApplicationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
    <div className="flex min-h-full flex-1 flex-col overflow-hidden md:flex-row">
      <aside className="max-h-64 flex-shrink-0 overflow-y-auto border-b border-brand-black/10 md:max-h-none md:w-96 md:border-b-0 md:border-r">
        <h1 className="px-4 pt-6 text-2xl font-light text-brand-black">
          Collaboration applications
        </h1>
        <a
          href="/#contact"
          target="_blank"
          rel="noopener noreferrer"
          className="block px-4 pt-1 text-sm underline text-brand-black/70"
        >
          Inspect form ↗
        </a>
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
  );
}
