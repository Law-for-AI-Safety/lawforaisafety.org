import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import {
  adminAuditLog,
  adminLinkedinRetired,
  cmsRoles,
  taskTrackerProjects,
  taskTrackerTasks,
} from "@/drizzle/schema";
import { db } from "@/lib/db";
import { timingSafeEqualStrings } from "@/lib/timing-safe-equal";
import { isOpportunitiesTeamEmail, isTaskTrackerTeamEmail, isTechAdminEmail } from "@/lib/session";

/**
 * Moving an admin from LinkedIn to their Workspace Google account ("Switch to Google").
 *
 * Only that button links an admin's LinkedIn address to their Workspace account. It is a
 * same-origin POST from a page shown to the LinkedIn session, and it marks the Google login
 * it starts with a cookie holding the hash of that session's token. The callback links the
 * two only when it returns to that same session, so a Google login started anywhere else,
 * such as another admin on a shared browser, can't close somebody else's LinkedIn login or
 * take over their roles.
 */
const COOKIE_NAME = "admin_switch_from";
// As long as the OAuth state it travels with (admin-oauth-state.ts).
const MAX_AGE_SECONDS = 60 * 10;

/** Starting a Google login: remembers which session asked to switch, or forgets any earlier request. */
export async function setSwitchFrom(sessionTokenHash: string | null): Promise<void> {
  const cookieStore = await cookies();
  if (!sessionTokenHash) {
    cookieStore.delete(COOKIE_NAME);
    return;
  }
  cookieStore.set(COOKIE_NAME, sessionTokenHash, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/**
 * Back from Google: whether the switch was asked for by the session this browser holds now.
 * The cookie is read once, then forgotten.
 */
export async function takeSwitchFor(sessionTokenHash: string | null): Promise<boolean> {
  const cookieStore = await cookies();
  const asked = cookieStore.get(COOKIE_NAME)?.value ?? null;
  cookieStore.delete(COOKIE_NAME);
  return asked !== null && sessionTokenHash !== null && timingSafeEqualStrings(asked, sessionTokenHash);
}

export type SwitchResult = {
  /** The CMS role moved to the Workspace address, if the LinkedIn address had one. */
  cmsRole: string | null;
  tasks: number;
  projects: number;
};

/**
 * Records that the owner of `linkedinEmail` has switched to `googleEmail`, in one transaction:
 * LinkedIn is closed for both addresses, and what is keyed to the LinkedIn address moves to the
 * Workspace one (their CMS role, the tasks assigned to them and the projects they own), with an
 * audit entry saying what moved. Records of what they did (audit logs, authorship) stay as they
 * are. A role the Workspace address already holds is kept if it is the stronger of the two.
 *
 * An admin who keeps LinkedIn (`keepsLinkedin`, see mayKeepLinkedin) may still sign in at the
 * LinkedIn address, so their CMS role is copied rather than moved. Their tasks and projects
 * move all the same: their Workspace address is their main one from now on, and work left at
 * the LinkedIn address would be stranded once it leaves ADMIN_LINKEDIN_KEEP_EMAILS.
 */
export async function switchAdmin(
  linkedinEmail: string,
  googleEmail: string,
  { keepsLinkedin }: { keepsLinkedin: boolean },
): Promise<SwitchResult> {
  const from = linkedinEmail.toLowerCase();
  const to = googleEmail.toLowerCase();
  return db.transaction(async (tx) => {
    await tx
      .insert(adminLinkedinRetired)
      .values([from, to].map((email) => ({ email, googleEmail: to })))
      .onConflictDoNothing();

    const [role] = keepsLinkedin
      ? await tx.select().from(cmsRoles).where(eq(cmsRoles.email, from))
      : await tx.delete(cmsRoles).where(eq(cmsRoles.email, from)).returning();
    if (role) {
      await tx
        .insert(cmsRoles)
        .values({ ...role, email: to })
        .onConflictDoUpdate({
          target: cmsRoles.email,
          // "publish" includes everything "draft" allows.
          set: {
            permission: sql`case when ${cmsRoles.permission} = 'publish' or excluded.permission = 'publish' then 'publish'::cms_permission else 'draft'::cms_permission end`,
          },
        });
    }
    const tasks = await tx
      .update(taskTrackerTasks)
      .set({ assigneeEmail: to })
      .where(sql`lower(${taskTrackerTasks.assigneeEmail}) = ${from}`)
      .returning({ id: taskTrackerTasks.id });
    const projects = await tx
      .update(taskTrackerProjects)
      .set({ ownerEmail: to })
      .where(sql`lower(${taskTrackerProjects.ownerEmail}) = ${from}`)
      .returning({ id: taskTrackerProjects.id });

    const result = { cmsRole: role?.permission ?? null, tasks: tasks.length, projects: projects.length };
    await tx.insert(adminAuditLog).values({
      actorEmail: to,
      action: "login",
      detail: { provider: "google", linkedinClosedFor: from, moved: result },
    });
    return result;
  });
}

/** The areas switching would lose, in the words the "Switch to Google" message uses. */
export const SWITCH_AREAS = {
  technical: "the technical admin pages",
  projects: "Projects",
  opportunities: "Opportunities",
} as const;
export type SwitchArea = keyof typeof SWITCH_AREAS;

/**
 * The areas `from` can reach that `to` couldn't, because the env-var lists (TECH_ADMIN_EMAILS
 * and the team lists) name only the LinkedIn address. A switch is refused while there are any,
 * so moving to Google never quietly costs an admin access. CMS roles move with the switch, so
 * they aren't counted.
 */
export function areasLostBySwitch(from: string, to: string): SwitchArea[] {
  const checks: [SwitchArea, (email: string) => boolean][] = [
    ["technical", isTechAdminEmail],
    ["projects", isTaskTrackerTeamEmail],
    ["opportunities", isOpportunitiesTeamEmail],
  ];
  return checks.filter(([, can]) => can(from) && !can(to)).map(([area]) => area);
}
