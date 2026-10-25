import Link from "next/link";
import { redirect } from "next/navigation";
import { countPendingSubmissions } from "@/lib/opportunity-submission-flow";
import { getAdminSession, isOpportunitiesTeamEmail } from "@/lib/session";

export default async function OpportunitiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }
  if (!isOpportunitiesTeamEmail(session.email)) {
    redirect("/admin");
  }
  const pending = await countPendingSubmissions();

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-brand-black/10 px-4 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/admin/opportunities" className="font-sans text-xl text-brand-black">
            Opportunities
          </Link>
          <Link href="/admin/opportunities/new" className="underline">
            New opportunity
          </Link>
          <Link href="/admin/opportunities/submissions" className="underline">
            Submissions{pending > 0 ? ` (${pending} to review)` : ""}
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
