import { and, count, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications,
  taskTrackerProjects,
  taskTrackerTasks,
} from "@/drizzle/schema";

/** Today (UTC) as YYYY-MM-DD, matching how the date columns are stored. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export type ApplicationsSummary = {
  pending: number;
  needsRetry: number;
  oldestPendingAt: Date | null;
};

/**
 * Counts for the admin dashboard's applications card. "Needs retry" is a
 * decided application whose notification email failed — invisible in the
 * pending count, but still someone's job to finish.
 */
export async function getApplicationsSummary(): Promise<ApplicationsSummary> {
  const [[pendingRow], [retryRow], [oldestRow]] = await Promise.all([
    db
      .select({ value: count() })
      .from(applications)
      .where(eq(applications.status, "pending")),
    db
      .select({ value: count() })
      .from(applications)
      .where(
        and(
          or(eq(applications.status, "approved"), eq(applications.status, "rejected")),
          eq(applications.notificationStatus, "failed"),
        ),
      ),
    db
      .select({ oldest: sql<Date | null>`min(${applications.createdAt})` })
      .from(applications)
      .where(eq(applications.status, "pending")),
  ]);

  return {
    pending: pendingRow?.value ?? 0,
    needsRetry: retryRow?.value ?? 0,
    oldestPendingAt: oldestRow?.oldest ? new Date(oldestRow.oldest) : null,
  };
}

export type TrackerSummary = {
  activeProjects: number;
  blockedProjects: number;
  overdueProjects: number;
  openTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  unassignedTasks: number;
  myOpenTasks: number;
  myOverdueTasks: number;
};

const OPEN_TASK = sql`${taskTrackerTasks.status} not in ('done', 'cancelled')`;
const OPEN_PROJECT = sql`${taskTrackerProjects.status} not in ('done', 'cancelled')`;

/**
 * Counts for the admin dashboard's tracker card, including the signed-in
 * person's own share so the card answers "is any of this mine?" without a
 * second page load.
 */
export async function getTrackerSummary(email: string): Promise<TrackerSummary> {
  const today = todayISO();
  const mine = sql`lower(${taskTrackerTasks.assigneeEmail}) = ${email.toLowerCase()}`;
  const tasks = (where: ReturnType<typeof sql>) =>
    db.select({ value: count() }).from(taskTrackerTasks).where(where);
  const projects = (where: ReturnType<typeof sql>) =>
    db.select({ value: count() }).from(taskTrackerProjects).where(where);

  const [
    [activeProjects],
    [blockedProjects],
    [overdueProjects],
    [openTasks],
    [overdueTasks],
    [blockedTasks],
    [unassignedTasks],
    [myOpenTasks],
    [myOverdueTasks],
  ] = await Promise.all([
    projects(OPEN_PROJECT),
    projects(sql`${taskTrackerProjects.status} = 'blocked'`),
    projects(sql`${OPEN_PROJECT} and ${taskTrackerProjects.plannedEnd} < ${today}`),
    tasks(OPEN_TASK),
    tasks(sql`${OPEN_TASK} and ${taskTrackerTasks.plannedEnd} < ${today}`),
    tasks(sql`${taskTrackerTasks.status} = 'blocked'`),
    db
      .select({ value: count() })
      .from(taskTrackerTasks)
      .where(and(OPEN_TASK, isNull(taskTrackerTasks.assigneeEmail))),
    tasks(sql`${OPEN_TASK} and ${mine}`),
    tasks(sql`${OPEN_TASK} and ${mine} and ${taskTrackerTasks.plannedEnd} < ${today}`),
  ]);

  return {
    activeProjects: activeProjects?.value ?? 0,
    blockedProjects: blockedProjects?.value ?? 0,
    overdueProjects: overdueProjects?.value ?? 0,
    openTasks: openTasks?.value ?? 0,
    overdueTasks: overdueTasks?.value ?? 0,
    blockedTasks: blockedTasks?.value ?? 0,
    unassignedTasks: unassignedTasks?.value ?? 0,
    myOpenTasks: myOpenTasks?.value ?? 0,
    myOverdueTasks: myOverdueTasks?.value ?? 0,
  };
}
