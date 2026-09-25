import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession, isTechAdminEmail, isTaskTrackerTeamEmail } from "@/lib/session";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-brand-black/10 px-4 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/admin" className="font-sans text-xl text-brand-black">
            Admin
          </Link>
          {/* "Collaboration" distinguishes these from other kinds of
              application the org may take later, e.g. public works. */}
          <Link href="/admin/applications" className="underline">
            Collaboration applications
          </Link>
          <Link href="/admin/red-lines-dialogue" className="underline">
            Red Lines Dialogues applications
          </Link>
          {isTaskTrackerTeamEmail(session.email) && (
            <Link href="/admin/task-tracker" className="underline">
              Project Tracker
            </Link>
          )}
          <span className="text-brand-black/70">Signed in as {session.name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {isTechAdminEmail(session.email) && (
            <>
              <Link href="/admin/settings" className="underline">
                Settings
              </Link>
              <Link href="/admin/erasure" className="underline">
                Erasure requests
              </Link>
              <Link href="/admin/audit" className="underline">
                Audit log
              </Link>
            </>
          )}
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

      {/* Scrolls for ordinary pages; the applications workspace below opts
          out and scrolls its two panes independently instead. */}
      <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  );
}
