import { fireEvent, render, screen, within } from "@testing-library/react";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminSessions,
  applications,
  cmsDrafts,
  cmsRoles,
  opportunities,
  opportunitySubmissions,
  redLinesApplications,
  taskTrackerProjects,
  taskTrackerTasks,
} from "@/drizzle/schema";
import { db } from "@/lib/db";
import { setStoredCmsPermission } from "@/lib/cms-store";
import { startAdminSession } from "@/lib/session";
import { cookieJar } from "../../../test/next-headers";
import ProtectedAdminLayout from "./(protected)/layout";
import AdminDashboardPage from "./(protected)/page";
import EmailPreviewPage from "./(protected)/email-preview/page";
import CmsLayout from "./cms/layout";
import OpportunitiesLayout from "./opportunities/layout";
import SettingsLayout from "./settings/layout";
import TaskTrackerLayout from "./task-tracker/layout";

vi.mock("next/headers", () => import("../../../test/next-headers"));

/** The four kinds of access the dev accounts stand for (src/lib/dev-accounts.ts). */
type Who = "tech" | "publish" | "draft" | "reviewer";
const email = (who: Who) => `${who}@example.com`;

async function signInAs(who: Who | "signed out") {
  cookieJar.reset();
  if (who !== "signed out") await startAdminSession({ email: email(who), name: `${who} person` });
}

beforeEach(async () => {
  vi.stubEnv("ADMIN_EMAILS", "tech@example.com,publish@example.com,draft@example.com,reviewer@example.com");
  vi.stubEnv("TECH_ADMIN_EMAILS", "tech@example.com");
  // The reviewer is kept out of the team-gated areas, as a narrowed deployment would.
  vi.stubEnv("TASK_TRACKER_TEAM_EMAILS", "tech@example.com,publish@example.com,draft@example.com");
  vi.stubEnv("OPPORTUNITIES_TEAM_EMAILS", "tech@example.com,publish@example.com");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
  for (const table of [adminSessions, applications, redLinesApplications, opportunitySubmissions, opportunities, cmsDrafts, cmsRoles, taskTrackerTasks, taskTrackerProjects]) {
    await db.delete(table);
  }
  await setStoredCmsPermission(email("publish"), "publish", "seed");
  await setStoredCmsPermission(email("draft"), "draft", "seed");
});

const nav = () => screen.getByRole("navigation", { name: "Admin" });
const linkNames = (scope: HTMLElement) => within(scope).getAllByRole("link").map((link) => link.getAttribute("href"));
const groupNames = () => within(nav()).getAllByRole("heading").map((heading) => heading.textContent);

async function seedWaitingWork() {
  const applicant = { authProvider: "email" as const, positionStatement: "Why I apply." };
  await db.insert(applications).values([
    { ...applicant, status: "pending", name: "Pending one" },
    { ...applicant, status: "pending", name: "Pending two" },
    { ...applicant, status: "approved", notificationStatus: "failed", name: "Needs retry" },
    { ...applicant, status: "approved", notificationStatus: "sent", name: "Done" },
  ]);
  await db.insert(redLinesApplications).values([{ status: "pending", name: "Waiting", createdAt: new Date("2026-11-10T12:00:00Z") }, { status: "approved", name: "Decided" }]);
  await db.insert(opportunitySubmissions).values({
    authProvider: "google",
    status: "pending",
    name: "Sam",
    email: "sam@example.org",
    type: "event",
    title: "Summit",
    org: "Org",
    applyUrl: "https://example.org",
    location: "Brussels",
    startDate: "2026-11-20",
    description: "Talks.",
  });
  const [project] = await db.insert(taskTrackerProjects).values({ name: "Project", status: "in_progress", createdBy: "seed" }).returning();
  await db.insert(taskTrackerTasks).values([
    { projectId: project.id, name: "Mine, late", status: "in_progress", assigneeEmail: "Tech@Example.com", plannedEnd: "2026-11-01", createdBy: "seed" },
    { projectId: project.id, name: "Mine, done", status: "done", assigneeEmail: "tech@example.com", plannedEnd: "2026-11-01", createdBy: "seed" },
    { projectId: project.id, name: "Mine, not due", status: "ready", assigneeEmail: "tech@example.com", plannedEnd: "2026-12-01", createdBy: "seed" },
    { projectId: project.id, name: "Someone else's, late", status: "ready", assigneeEmail: "draft@example.com", plannedEnd: "2026-11-01", createdBy: "seed" },
  ]);
}

describe("the sidebar", () => {
  it.each<[Who, string[], (string | null)[]]>([
    [
      "tech",
      ["Review", "Publish", "Work"],
      ["/admin", "/admin/applications", "/admin/red-lines-dialogue", "/admin/cms", "/admin/opportunities", "/admin/task-tracker"],
    ],
    [
      "publish",
      ["Review", "Publish", "Work"],
      ["/admin", "/admin/applications", "/admin/red-lines-dialogue", "/admin/cms", "/admin/opportunities", "/admin/task-tracker"],
    ],
    ["draft", ["Review", "Publish", "Work"], ["/admin", "/admin/applications", "/admin/red-lines-dialogue", "/admin/cms", "/admin/task-tracker"]],
    ["reviewer", ["Review"], ["/admin", "/admin/applications", "/admin/red-lines-dialogue"]],
  ])("shows %s the groups and links they can use, and hides empty groups", async (who, groups, hrefs) => {
    await signInAs(who);
    render(await ProtectedAdminLayout({ children: <p>body</p> }));
    expect(groupNames()).toEqual(groups);
    expect(linkNames(screen.getByRole("complementary"))).toEqual(hrefs);
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("keeps the technical admins' tools and Log out in the account menu, for technical admins only", async () => {
    await signInAs("tech");
    const { unmount } = render(await ProtectedAdminLayout({ children: null }));
    const account = screen.getByRole("button", { name: "Account" });
    expect(account).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
    fireEvent.click(account);
    expect(account).toHaveAttribute("aria-expanded", "true");
    expect(["Settings", "Erasure requests", "Audit log", "Email preview"].map((name) => screen.getByRole("link", { name }).getAttribute("href"))).toEqual([
      "/admin/settings",
      "/admin/erasure",
      "/admin/audit",
      "/admin/email-preview",
    ]);
    expect(screen.getByRole("button", { name: "Log out" }).closest("form")).toHaveAttribute("action", "/api/admin/logout");
    unmount();

    await signInAs("reviewer");
    render(await ProtectedAdminLayout({ children: null }));
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.queryByRole("link", { name: "Email preview" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("counts the waiting work beside each link", async () => {
    await seedWaitingWork();
    await signInAs("tech");
    render(await ProtectedAdminLayout({ children: null }));
    expect(screen.getByRole("link", { name: "Collaboration (3 waiting)" })).toHaveAttribute("href", "/admin/applications");
    expect(screen.getByRole("link", { name: "Red Lines (1 waiting)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Opportunities (1 submissions to review)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Projects (1 of your tasks overdue)" })).toBeInTheDocument();
  });

  it("shows no badge where nothing is waiting", async () => {
    await signInAs("tech");
    render(await ProtectedAdminLayout({ children: null }));
    for (const name of ["Collaboration", "Red Lines", "Opportunities", "Projects"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("still shows a link, without its badge, when its count cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await seedWaitingWork();
    await signInAs("tech");
    await db.execute(sql`ALTER TABLE red_lines_applications RENAME TO red_lines_unavailable`);
    try {
      render(await ProtectedAdminLayout({ children: <p>body</p> }));
    } finally {
      await db.execute(sql`ALTER TABLE red_lines_unavailable RENAME TO red_lines_applications`);
    }
    expect(screen.getByRole("link", { name: "Red Lines" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Collaboration (3 waiting)" })).toBeInTheDocument();
    expect(console.error).toHaveBeenCalledWith("[admin] Could not count redLines for the nav", expect.any(Error));
  });

  it("sends a signed-out visitor to the login page", async () => {
    await signInAs("signed out");
    await expect(ProtectedAdminLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    await expect(CmsLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    await expect(SettingsLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/admin/login");
  });

  it.each([
    ["website pages", CmsLayout],
    ["settings", SettingsLayout],
  ])("frames the %s too", async (_, Layout) => {
    await signInAs("publish");
    render(await Layout({ children: <p>body</p> }));
    expect(nav()).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });
});

describe("moving admins from LinkedIn to Google", () => {
  const banner = () => screen.queryByRole("status");

  it("asks an admin signed in on a personal address to switch to Google", async () => {
    vi.stubEnv("ADMIN_GOOGLE_DOMAIN", "lais.example");
    await signInAs("reviewer");
    render(await ProtectedAdminLayout({ children: null }));
    expect(banner()).toHaveTextContent("You're signed in with LinkedIn");
    expect(within(banner()!).getByRole("link", { name: "Switch to Google" })).toHaveAttribute("href", "/api/admin/auth/google");
  });

  it("doesn't ask a Workspace account, an admin who keeps LinkedIn, or anyone before Google login is set up", async () => {
    vi.stubEnv("ADMIN_EMAILS", "tech@example.com,reviewer@example.com,sam@lais.example");
    for (const [domain, keep, who] of [
      ["lais.example", "", "sam@lais.example"],
      ["lais.example", "reviewer@example.com", "reviewer@example.com"],
      ["", "", "reviewer@example.com"],
    ]) {
      vi.stubEnv("ADMIN_GOOGLE_DOMAIN", domain);
      vi.stubEnv("ADMIN_LINKEDIN_KEEP_EMAILS", keep);
      cookieJar.reset();
      await startAdminSession({ email: who, name: "Someone" });
      const { unmount } = render(await ProtectedAdminLayout({ children: null }));
      expect(banner()).toBeNull();
      unmount();
    }
  });
});

describe("the area tabs", () => {
  it("lists the opportunities pages as tabs, with the submissions waiting", async () => {
    await seedWaitingWork();
    await signInAs("publish");
    window.history.replaceState(null, "", "/admin/opportunities/submissions");
    render(await OpportunitiesLayout({ children: null }));
    const tabs = screen.getByRole("navigation", { name: "Opportunities" });
    expect(linkNames(tabs)).toEqual(["/admin/opportunities", "/admin/opportunities/new", "/admin/opportunities/submissions"]);
    expect(within(tabs).getByRole("link", { name: "Submissions (1 to review)" })).toHaveAttribute("aria-current", "page");
    expect(within(nav()).getByRole("link", { name: /^Opportunities/ })).toHaveAttribute("aria-current", "page");
  });

  it("lists the project tracker's pages as tabs", async () => {
    await signInAs("draft");
    window.history.replaceState(null, "", "/admin/task-tracker/projects/some-id");
    render(await TaskTrackerLayout({ children: null }));
    const tabs = screen.getByRole("navigation", { name: "Projects" });
    expect(within(tabs).getByRole("link", { name: "All projects" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "Your work" })).not.toHaveAttribute("aria-current");
  });

  it("keeps people outside a team out of its area", async () => {
    await signInAs("reviewer");
    await expect(TaskTrackerLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/admin");
    await expect(OpportunitiesLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/admin");
    await signInAs("signed out");
    await expect(TaskTrackerLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    await expect(OpportunitiesLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/admin/login");
  });
});

describe("the dashboard", () => {
  const cardTitles = () => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

  it.each<[Who, string[]]>([
    ["tech", ["Collaboration", "Red Lines", "Website pages", "Opportunities", "Projects", "Technical admin"]],
    ["publish", ["Collaboration", "Red Lines", "Website pages", "Opportunities", "Projects"]],
    ["draft", ["Collaboration", "Red Lines", "Website pages", "Projects"]],
    ["reviewer", ["Collaboration", "Red Lines"]],
  ])("has a card for each area %s can use", async (who, titles) => {
    await signInAs(who);
    render(await AdminDashboardPage());
    expect(cardTitles()).toEqual(titles);
  });

  it("says what is waiting in each area", async () => {
    await seedWaitingWork();
    await db.insert(cmsDrafts).values({ page: "field-building", content: {}, baseHash: "x", authorEmail: email("tech"), version: 1, valid: true });
    await db.insert(opportunities).values({
      slug: "draft-job",
      type: "job",
      title: "Draft Job",
      org: "Org",
      summary: "S",
      description: "D",
      locationCountry: "GLOBAL",
      remote: true,
      applyUrl: "https://example.com",
      status: "draft",
      createdBy: "seed",
    });
    await signInAs("tech");
    render(await AdminDashboardPage());

    const card = (title: string) => screen.getByRole("heading", { name: title }).closest("section")!;
    expect(within(card("Red Lines")).getByText(/Oldest has been waiting 5 days\./)).toBeInTheDocument();
    expect(within(card("Website pages")).getByText("With unpublished changes").previousSibling).toHaveTextContent("1");
    expect(within(card("Opportunities")).getByText(/1 submission is waiting for a decision\./)).toBeInTheDocument();
    expect(within(card("Opportunities")).getByText("Drafts to publish").previousSibling).toHaveTextContent("1");
    expect(within(card("Technical admin")).getByRole("link", { name: "Email preview" })).toHaveAttribute("href", "/admin/email-preview");
  });

  it("keeps the rest of the dashboard when one area's numbers cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await seedWaitingWork();
    await signInAs("tech");
    await db.execute(sql`ALTER TABLE opportunity_submissions RENAME TO opportunity_submissions_unavailable`);
    try {
      render(await AdminDashboardPage());
    } finally {
      await db.execute(sql`ALTER TABLE opportunity_submissions_unavailable RENAME TO opportunity_submissions`);
    }
    const card = (title: string) => screen.getByRole("heading", { name: title }).closest("section")!;
    expect(within(card("Opportunities")).getByText("These numbers could not be loaded just now.")).toBeInTheDocument();
    expect(within(card("Red Lines")).getByText("Waiting for review")).toBeInTheDocument();
    expect(console.error).toHaveBeenCalledWith("[admin] Could not load the dashboard's opportunities numbers", expect.any(Error));
  });

  it.each([
    ["Collaboration", "applications", "applications_unavailable"],
    ["Red Lines", "red_lines_applications", "red_lines_unavailable"],
    ["Website pages", "cms_drafts", "cms_drafts_unavailable"],
    ["Projects", "task_tracker_tasks", "task_tracker_tasks_unavailable"],
  ])("says so on the %s card when its numbers cannot be read", async (title, table, renamed) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await signInAs("tech");
    await db.execute(sql.raw(`ALTER TABLE ${table} RENAME TO ${renamed}`));
    try {
      render(await AdminDashboardPage());
    } finally {
      await db.execute(sql.raw(`ALTER TABLE ${renamed} RENAME TO ${table}`));
    }
    const card = screen.getByRole("heading", { name: title }).closest("section")!;
    expect(within(card).getByText("These numbers could not be loaded just now.")).toBeInTheDocument();
  });

  it("says when nothing is waiting", async () => {
    await signInAs("publish");
    render(await AdminDashboardPage());
    const card = (title: string) => screen.getByRole("heading", { name: title }).closest("section")!;
    expect(within(card("Red Lines")).getByText(/Nothing waiting for review\./)).toBeInTheDocument();
    expect(within(card("Opportunities")).getByText(/No submissions waiting\./)).toBeInTheDocument();
  });
});

describe("the email preview", () => {
  it("is for technical admins only", async () => {
    await signInAs("reviewer");
    render(await EmailPreviewPage());
    expect(screen.getByRole("heading", { name: "Technical admins only" })).toBeInTheDocument();
  });

  it("renders the emails for a technical admin", async () => {
    await signInAs("tech");
    render(await EmailPreviewPage());
    expect(screen.getByRole("heading", { name: "Email preview" })).toBeInTheDocument();
  });

  it("sends a signed-out visitor to the login page", async () => {
    await signInAs("signed out");
    await expect(EmailPreviewPage()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
  });
});
