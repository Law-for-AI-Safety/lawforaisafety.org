import type { TaskTrackerStatus } from "./status";
import { formatDate, summariseDue } from "./dates";

/**
 * "Overdue by 3 days · Mon 19 Sep" / "Due in 2 weeks · Tue 6 Oct". The
 * relative part is what people act on; the date is there to plan around.
 */
export default function DueDate({
  plannedEnd,
  status,
  actualEnd = null,
}: {
  plannedEnd: string | null;
  status: TaskTrackerStatus;
  actualEnd?: string | null;
}) {
  const date = formatDate(plannedEnd);
  if (!date) return null;
  const summary = summariseDue(plannedEnd, status, actualEnd);

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      {summary?.tone === "overdue" ? (
        <span className="border border-brand-red bg-brand-red/10 px-1.5 text-brand-red">
          {summary.text}
        </span>
      ) : summary ? (
        <span className={summary.tone === "soon" ? "text-brand-navy" : undefined}>
          {summary.text}
        </span>
      ) : (
        <span>Due</span>
      )}
      <span>
        {summary ? "· " : ""}
        {date}
      </span>
    </span>
  );
}
