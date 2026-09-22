import type { TaskTrackerStatus } from "./status";

/*
 * All dates here are date-only ISO strings ("2026-09-30"), as stored in the
 * `date` columns. They're parsed and formatted in UTC so a date never shifts
 * by a day depending on the viewer's timezone.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today as YYYY-MM-DD in the local timezone of whoever is running this. */
export function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function addDaysISO(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

export function endOfMonthISO(iso: string): string {
  const date = new Date(iso);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
}

/** Whole days from `from` to `to` — negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/** "Tue 30 Sep", with the year added when it isn't the current one. */
export function formatDate(value: string | null): string | null {
  if (!value) return null;
  const sameYear = value.slice(0, 4) === todayISO().slice(0, 4);
  return new Date(value).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

/** "3 days", "2 weeks", "4 months" — rounded to the unit people think in. */
export function formatSpan(days: number): string {
  const abs = Math.abs(days);
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (abs < 14) return unit(abs, "day");
  if (abs < 60) return unit(Math.round(abs / 7), "week");
  return unit(Math.round(abs / 30), "month");
}

/** "today", "tomorrow", "in 5 days", "3 weeks ago". */
export function describeRelative(value: string, today = todayISO()): string {
  const days = daysBetween(today, value);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${formatSpan(days)}` : `${formatSpan(days)} ago`;
}

function isFinished(status: TaskTrackerStatus): boolean {
  return status === "done" || status === "cancelled";
}

/** A planned end date that's passed, on something not yet finished. */
export function isOverdue(plannedEnd: string | null, status: TaskTrackerStatus): boolean {
  if (!plannedEnd || isFinished(status)) return false;
  return plannedEnd < todayISO();
}

export type DueSummary = {
  text: string;
  tone: "overdue" | "soon" | "normal";
};

/**
 * The one-line deadline summary used on lists and headers:
 * "Overdue by 3 days", "Due today", "Due in 2 weeks", "Done 2 days late".
 */
export function summariseDue(
  plannedEnd: string | null,
  status: TaskTrackerStatus,
  actualEnd: string | null = null,
): DueSummary | null {
  if (!plannedEnd) return null;
  const today = todayISO();

  if (status === "cancelled") return null;
  if (status === "done") {
    if (!actualEnd) return null;
    const late = daysBetween(plannedEnd, actualEnd);
    return {
      text: late > 0 ? `Done ${formatSpan(late)} late` : "Done on time",
      tone: "normal",
    };
  }

  const days = daysBetween(today, plannedEnd);
  if (days < 0) return { text: `Overdue by ${formatSpan(days)}`, tone: "overdue" };
  if (days === 0) return { text: "Due today", tone: "soon" };
  if (days === 1) return { text: "Due tomorrow", tone: "soon" };
  return { text: `Due in ${formatSpan(days)}`, tone: days <= 3 ? "soon" : "normal" };
}
