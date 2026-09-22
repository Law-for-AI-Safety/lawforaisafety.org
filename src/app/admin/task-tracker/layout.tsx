import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession, isTaskTrackerTeamEmail } from "@/lib/session";

export default async function TaskTrackerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }
  if (!isTaskTrackerTeamEmail(session.email)) {
    redirect("/admin");
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-brand-black/10 px-4 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/admin/task-tracker" className="font-sans text-xl text-brand-black">
            Project Tracker
          </Link>
          <Link href="/admin/task-tracker" className="underline">
            Your work
          </Link>
          <Link href="/admin/task-tracker/projects" className="underline">
            All projects
          </Link>
          <span className="text-brand-black/70">Signed in as {session.name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/admin" className="underline">
            Back to admin
          </Link>
          <form action="/api/admin/logout" method="post">
            <button type="submit" className="underline">
              Log out
            </button>
          </form>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
