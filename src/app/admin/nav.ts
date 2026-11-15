/**
 * Everything the admin sidebar links to, in one place. The shell (AdminShell.tsx) keeps the
 * items the signed-in person can use, adds their counts, and drops any group left empty, so a
 * new admin area is one line in NAV_ITEMS.
 */

/** What the signed-in person may open, worked out once per request by getAdminAccess. */
export type AdminAccess = {
  /** In TECH_ADMIN_EMAILS: settings, erasure, the audit log, email previews. */
  tech: boolean;
  /** isTaskTrackerTeamEmail */
  tracker: boolean;
  /** isOpportunitiesTeamEmail */
  opportunities: boolean;
  /** cmsCan(access, "edit") */
  cmsEdit: boolean;
};

/** The waiting-work counts the sidebar can show; each is fetched by the shell (getNavCount). */
export type NavCountKey = "collaboration" | "redLines" | "submissions" | "myOverdueTasks";

export const NAV_GROUPS = ["Review", "Publish", "Work"] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export type AdminNavItem = {
  group: NavGroup;
  href: string;
  label: string;
  /** Who sees the link. Left out, every admin does. */
  show?: (access: AdminAccess) => boolean;
  /** A badge of waiting work, hidden at zero. `label` finishes "3 …" for screen readers. */
  count?: { key: NavCountKey; label: string; urgent?: boolean };
};

export const NAV_ITEMS: AdminNavItem[] = [
  { group: "Review", href: "/admin/applications", label: "Collaboration", count: { key: "collaboration", label: "waiting" } },
  { group: "Review", href: "/admin/red-lines-dialogue", label: "Red Lines", count: { key: "redLines", label: "waiting" } },
  { group: "Publish", href: "/admin/cms", label: "Website pages", show: (a) => a.cmsEdit },
  {
    group: "Publish",
    href: "/admin/opportunities",
    label: "Opportunities",
    show: (a) => a.opportunities,
    count: { key: "submissions", label: "submissions to review" },
  },
  {
    group: "Work",
    href: "/admin/task-tracker",
    label: "Projects",
    show: (a) => a.tracker,
    count: { key: "myOverdueTasks", label: "of your tasks overdue", urgent: true },
  },
];

/** The account menu at the foot of the sidebar, above Log out. */
export const ACCOUNT_ITEMS: { href: string; label: string; show?: (access: AdminAccess) => boolean }[] = [
  { href: "/admin/settings", label: "Settings", show: (a) => a.tech },
  { href: "/admin/erasure", label: "Erasure requests", show: (a) => a.tech },
  { href: "/admin/audit", label: "Audit log", show: (a) => a.tech },
  { href: "/admin/email-preview", label: "Email preview", show: (a) => a.tech },
];

/** A link as the browser gets it: no functions, counts already filled in. */
export type ShellLink = { href: string; label: string; count?: { value: number; label: string; urgent: boolean } };
export type ShellGroup = { name: NavGroup; links: ShellLink[] };

export function visibleTo<T extends { show?: (access: AdminAccess) => boolean }>(items: T[], access: AdminAccess): T[] {
  return items.filter((item) => item.show?.(access) ?? true);
}

/**
 * Which of `hrefs` the page at `pathname` belongs to: the longest one that is the path or a
 * parent of it, so /admin/task-tracker/projects/7 highlights All projects, not Your work.
 * Links to a fragment (#drafts) never count, as they point into a page rather than at one.
 */
export function activeHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (href.includes("#")) continue;
    if ((pathname === href || pathname.startsWith(`${href}/`)) && href.length > (best?.length ?? -1)) best = href;
  }
  return best;
}
