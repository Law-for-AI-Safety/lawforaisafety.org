import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getApplicationsSummary, getRedLinesSummary, getTrackerSummary } from "@/lib/admin-summary";
import { listDrafts } from "@/lib/cms-store";
import { countPendingSubmissions } from "@/lib/opportunity-submission-flow";
import { countDraftOpportunities } from "@/opportunities/data";
import { getAdminAccess } from "../access";
import { ACCOUNT_ITEMS, visibleTo } from "../nav";

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
  children?: React.ReactNode;
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The admin front door: what needs attention in every area the signed-in person can use, in
 * the sidebar's order, rather than dropping straight into one queue.
 */
export default async function AdminDashboardPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const access = await getAdminAccess(session.email);
  const [applications, redLines, cmsDrafts, submissions, opportunityDrafts, tracker] = await Promise.all([
    getApplicationsSummary(),
    getRedLinesSummary(),
    access.cmsEdit ? listDrafts().then((drafts) => drafts.length) : null,
    access.opportunities ? countPendingSubmissions() : null,
    access.opportunities ? countDraftOpportunities() : null,
    access.tracker ? getTrackerSummary(session.email) : null,
  ]);
  const tools = visibleTo(ACCOUNT_ITEMS, access);

  const firstName = session.name.split(" ")[0] || session.name;
  const waiting = waitingLabel(applications.oldestPendingAt);
  const redLinesWaiting = waitingLabel(redLines.oldestPendingAt);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:py-12">
      <h1 className="font-sans text-3xl text-brand-black">Welcome back, {firstName}</h1>

      <Card title="Collaboration" links={[{ href: "/admin/applications", label: "Review applications" }]}>
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

      <Card
        title="Red Lines"
        links={[
          { href: "/admin/red-lines-dialogue", label: "Review applications" },
          { href: "/admin/red-lines-dialogue/decided", label: "Decided applications" },
        ]}
      >
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <Stat value={redLines.pending} label="Waiting for review" urgent />
        </div>
        <p className="text-sm text-brand-black/70">
          People applying to take part in the Red Lines Dialogues. {redLinesWaiting ?? "Nothing waiting for review."}
        </p>
      </Card>

      {cmsDrafts !== null && (
        <Card title="Website pages" links={[{ href: "/admin/cms", label: "Edit pages" }]}>
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <Stat value={cmsDrafts} label="With unpublished changes" />
          </div>
          <p className="text-sm text-brand-black/70">The pages of the public site that can be edited here.</p>
        </Card>
      )}

      {submissions !== null && opportunityDrafts !== null && (
        <Card
          title="Opportunities"
          links={[
            { href: "/admin/opportunities/submissions", label: "Review submissions" },
            { href: "/admin/opportunities", label: "Listings" },
            { href: "/admin/opportunities/new", label: "New opportunity" },
          ]}
        >
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <Stat value={submissions} label="Submissions to review" urgent />
            <Stat value={opportunityDrafts} label="Drafts to publish" />
          </div>
          <p className="text-sm text-brand-black/70">
            The public opportunities board.{" "}
            {submissions === 0
              ? "No submissions waiting."
              : `${plural(submissions, "submission is", "submissions are")} waiting for a decision.`}
          </p>
        </Card>
      )}

      {tracker && (
        <Card
          title="Projects"
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

      {tools.length > 0 && (
        <Card title="Technical admin" links={tools.map(({ href, label }) => ({ href, label }))}>
          <p className="text-sm text-brand-black/70">Site settings, data erasure, the audit log and email previews.</p>
        </Card>
      )}
    </main>
  );
}
