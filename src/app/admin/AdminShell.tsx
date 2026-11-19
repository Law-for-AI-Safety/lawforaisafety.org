import { redirect } from "next/navigation";
import { countCollaborationQueue, countMyOverdueTasks, getRedLinesSummary } from "@/lib/admin-summary";
import { countPendingSubmissions } from "@/lib/opportunity-submission-flow";
import { getAdminSession } from "@/lib/session";
import { shouldOfferGoogle } from "@/lib/admin-workspace";
import { getAdminAccess } from "./access";
import AdminSidebar from "./AdminSidebar";
import { ACCOUNT_ITEMS, NAV_GROUPS, NAV_ITEMS, visibleTo, type NavCountKey, type ShellGroup } from "./nav";

const COUNTS: Record<NavCountKey, (email: string) => Promise<number>> = {
  collaboration: countCollaborationQueue,
  redLines: async () => (await getRedLinesSummary()).pending,
  submissions: countPendingSubmissions,
  myOverdueTasks: countMyOverdueTasks,
};

/** A badge is a convenience: if its count cannot be read, the link is shown without one. */
function navCount(key: NavCountKey, email: string): Promise<number | null> {
  return COUNTS[key](email).catch((err) => {
    console.error(`[admin] Could not count ${key} for the nav`, err);
    return null;
  });
}

/**
 * The frame around every signed-in admin page: the sidebar (a drawer on phones) beside the
 * page. Each area's layout returns it, so the login page and the previews stay bare. Only
 * signed-in admins get it; each page still checks its own permission. A function the layouts
 * await rather than an async component, so a test can render a layout's result directly.
 */
export async function withAdminShell(children: React.ReactNode): Promise<React.ReactElement> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const access = await getAdminAccess(session.email);
  const items = visibleTo(NAV_ITEMS, access);
  const counts = await Promise.all(items.map((item) => (item.count ? navCount(item.count.key, session.email) : null)));

  const groups: ShellGroup[] = NAV_GROUPS.map((name) => ({
    name,
    links: items.flatMap((item, i) => {
      if (item.group !== name) return [];
      const value = counts[i];
      return [
        {
          href: item.href,
          label: item.label,
          ...(item.count && value ? { count: { value, label: item.count.label, urgent: item.count.urgent ?? false } } : {}),
        },
      ];
    }),
  })).filter((group) => group.links.length > 0);

  const account = visibleTo(ACCOUNT_ITEMS, access).map(({ href, label }) => ({ href, label }));

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      <AdminSidebar groups={groups} account={account} name={session.name} />
      {/* Scrolls for ordinary pages; the applications workspace and the page editor opt out
          and scroll their panes independently instead. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        {shouldOfferGoogle(session.email) && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-black/15 bg-brand-navy/5 px-4 py-3 text-sm text-brand-black"
          >
            <p>
              You&apos;re signed in with LinkedIn, which admin login is moving away from. Switch to
              your Law for AI Safety Google account; after that, LinkedIn login stops working for you.
            </p>
            <a href="/api/admin/auth/google?switch=1" className="bg-brand-navy px-4 py-2 text-brand-white">
              Switch to Google
            </a>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
