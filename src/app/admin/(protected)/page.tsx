import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession, isTaskTrackerTeamEmail } from "@/lib/session";
import { getApplicationsSummary, getTrackerSummary } from "@/lib/admin-summary";

export const metadata: Metadata = {
  title: "LAIS - Admin",
  robots: { index: false, follow: false },
};

/** One number with its label; red when it's something to act on. */
function Stat({
  value,
  label,
  urgent = false,
}: {
  value: number;
  label: string;
  urgent?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span
        className={`font-sans text-3xl ${urgent && value > 0 ? "text-brand-red" : "text-brand-black"}`}
      >
        {value}
      </span>
      <span className="text-sm text-brand-black/70">{label}</span>
    </div>
  );
}

function Card({
  title,
  children,
  links,
}: {
  title: string;
  children: React.ReactNode;
  links: { href: string; label: string }[];
}) {
  return (
    <section className="flex flex-col gap-4 border border-brand-black/10 p-4">
      <h2 className="font-sans text-xl text-brand-black">{title}</h2>
      {children}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="underline">
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function waitingLabel(since: Date | null): string | null {
  if (!since) return null;
  const days = Math.floor((Date.now() - since.getTime()) / 86_400_000);
  if (days < 1) return "Oldest arrived today.";
  return `Oldest has been waiting ${days} day${days === 1 ? "" : "s"}.`;
}

/**
 * The admin front door: what needs attention across both jobs this panel
 * does, rather than dropping straight into the application queue.
 */
export default async function AdminDashboardPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const showTracker = isTaskTrackerTeamEmail(session.email);
  const [applications, tracker] = await Promise.all([
    getApplicationsSummary(),
    showTracker ? getTrackerSummary(session.email) : null,
  ]);

  const firstName = session.name.split(" ")[0] || session.name;
  const waiting = waitingLabel(applications.oldestPendingAt);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:py-12">
      <h1 className="font-sans text-3xl text-brand-black">Welcome back, {firstName}</h1>

      <Card
        title="Collaboration applications"
        links={[{ href: "/admin/applications", label: "Review applications" }]}
      >
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <Stat value={applications.pending} label="Waiting for review" urgent />
          <Stat value={applications.needsRetry} label="Notification failed" urgent />
        </div>
        <p className="text-sm text-brand-black/70">
          People applying to collaborate with Law for AI Safety.{" "}
          {applications.pending === 0 && applications.needsRetry === 0
            ? "Nothing waiting for review."
            : (waiting ?? "Some decided applications still need their email retried.")}
        </p>
      </Card>

      {tracker && (
        <Card
          title="Projects and tasks"
          links={[
            { href: "/admin/task-tracker", label: "Your work" },
            { href: "/admin/task-tracker/projects", label: "All projects" },
          ]}
        >
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <Stat value={tracker.myOpenTasks} label="Assigned to you" />
            <Stat value={tracker.myOverdueTasks} label="Yours overdue" urgent />
            <Stat value={tracker.activeProjects} label="Active projects" />
            <Stat value={tracker.openTasks} label="Open tasks" />
            <Stat value={tracker.overdueTasks} label="Overdue tasks" urgent />
            <Stat value={tracker.blockedTasks} label="Blocked tasks" urgent />
          </div>
          <p className="text-sm text-brand-black/70">
            {[
              tracker.overdueProjects > 0 &&
                `${tracker.overdueProjects} project${
                  tracker.overdueProjects === 1 ? " is" : "s are"
                } past their due date.`,
              tracker.blockedProjects > 0 &&
                `${tracker.blockedProjects} project${
                  tracker.blockedProjects === 1 ? " is" : "s are"
                } blocked.`,
              tracker.unassignedTasks > 0 &&
                `${tracker.unassignedTasks} open task${
                  tracker.unassignedTasks === 1 ? " has" : "s have"
                } nobody assigned.`,
            ]
              .filter(Boolean)
              .join(" ") || "Nothing overdue, blocked or unassigned."}
          </p>
        </Card>
      )}
    </main>
  );
}
