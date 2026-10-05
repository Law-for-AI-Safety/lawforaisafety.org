import Link from "next/link";
import StatusBadge from "./StatusBadge";
import type { TaskTrackerStatus } from "./status";
import { STATUS_LABELS, TASK_TRACKER_STATUSES } from "./status";
import { addDaysISO, daysBetween, formatDate, todayISO } from "./dates";

export type TimelineTask = {
  id: string;
  name: string;
  status: TaskTrackerStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
};

/** Bar colour by status — same meanings as the badges. */
const BAR_CLASSES: Record<TaskTrackerStatus, string> = {
  // Hollow: nothing has started yet, and it reads apart from Done's grey.
  draft: "border border-brand-black/40 bg-brand-white",
  ready: "bg-brand-navy/40",
  in_progress: "bg-brand-navy",
  blocked: "bg-brand-red",
  done: "bg-brand-black/40",
  cancelled: "bg-brand-black/10",
};

/** Diagonal red hatching for the days a task has run past its due date. */
const OVERRUN_STRIPES =
  "repeating-linear-gradient(45deg, var(--color-brand-red) 0 3px, transparent 3px 7px)";

type Bar = {
  task: TimelineTask;
  start: string;
  end: string;
  overdue: boolean;
};

/** Compact week label: "18 Aug". */
function formatWeekLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** The Monday on or before a date — the timeline's gridlines are weeks. */
function weekStart(iso: string): string {
  const date = new Date(iso);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return addDaysISO(iso, -daysSinceMonday);
}

/** Saturday–Sunday spans within range, as [start, endExclusive] pairs. */
function weekends(first: string, last: string): [string, string][] {
  const bands: [string, string][] = [];
  // Start from the Saturday of the first week, which may fall before `first`.
  for (
    let saturday = addDaysISO(weekStart(first), 5);
    saturday <= last;
    saturday = addDaysISO(saturday, 7)
  ) {
    const start = saturday < first ? first : saturday;
    const endExclusive = addDaysISO(saturday, 2);
    bands.push([start, endExclusive > last ? last : endExclusive]);
  }
  return bands;
}

/** Every Monday in range, thinned out so the labels can't collide. */
function weekTicks(first: string, last: string): string[] {
  const all: string[] = [];
  for (let week = weekStart(first); week <= last; week = addDaysISO(week, 7)) {
    if (week >= first) all.push(week);
  }
  const step = Math.ceil(all.length / 10) || 1;
  return all.filter((_, index) => index % step === 0);
}

/** A task only gets a bar once it has both ends of a range to draw. */
function barFor(task: TimelineTask, today: string): Bar | null {
  const start = task.actualStart ?? task.plannedStart;
  const end = task.actualEnd ?? task.plannedEnd;
  if (!start || !end) return null;
  const finished = task.status === "done" || task.status === "cancelled";
  // An unfinished task whose end date has passed keeps its planned bar and
  // gains a striped "overrun" segment running to today, so the slip is
  // visible instead of hidden behind the original plan.
  return { task, start, end, overdue: !finished && end < today };
}

/**
 * A plain Gantt-style view of one project: one row per task, bars placed on
 * a shared date scale with a line for today. Rendered server-side as
 * percentage widths — no charting library, and it degrades to a readable
 * list of dates on a narrow screen (the chart scrolls sideways).
 */
export default function ProjectTimeline({ tasks }: { tasks: TimelineTask[] }) {
  const today = todayISO();
  const bars = tasks.map((task) => barFor(task, today)).filter((bar): bar is Bar => bar !== null);
  const undated = tasks.filter((task) => !barFor(task, today));

  if (bars.length === 0) return null;

  // One day of padding each side so bars don't touch the frame.
  const first = addDaysISO(bars.reduce((min, bar) => (bar.start < min ? bar.start : min), bars[0].start), -1);
  const last = addDaysISO(
    bars.reduce(
      (max, bar) => {
        const barEnd = bar.overdue ? today : bar.end;
        return barEnd > max ? barEnd : max;
      },
      bars[0].overdue ? today : bars[0].end,
    ),
    1,
  );
  const span = Math.max(daysBetween(first, last), 1);
  const offset = (date: string) => (daysBetween(first, date) / span) * 100;
  const todayOffset = today >= first && today <= last ? offset(today) : null;
  const ticks = weekTicks(first, last);
  const usedStatuses = TASK_TRACKER_STATUSES.filter((status) =>
    bars.some((bar) => bar.task.status === status),
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-sans text-xl text-brand-black">Timeline</h2>
        <p className="text-sm text-brand-black/70">
          {formatDate(first)} – {formatDate(last)}
        </p>
      </div>

      {/* Narrow screens scroll this sideways rather than squashing the bars. */}
      <div className="overflow-x-auto">
        <div className="relative min-w-[32rem] border border-brand-black/10">
          {/* Week scale: a label and a gridline every Monday, so a bar's
              position can be read off the chart instead of only from the
              dates written under it. */}
          <div className="relative h-6 border-b border-brand-black/10">
            {ticks.map((tick) => (
              <span
                key={tick}
                className="absolute top-1 pl-1 text-xs whitespace-nowrap text-brand-black/70"
                style={{ left: `${offset(tick)}%` }}
              >
                {formatWeekLabel(tick)}
              </span>
            ))}
          </div>

          {/* Weekends shaded so a bar's length reads as working days.
              Drawn before the gridlines and bars, which paint over it. */}
          {weekends(first, last).map(([start, end]) => (
            <div
              key={start}
              aria-hidden
              className="absolute top-6 bottom-0 bg-brand-black/5"
              style={{ left: `${offset(start)}%`, width: `${offset(end) - offset(start)}%` }}
            />
          ))}

          {ticks.map((tick) => (
            <div
              key={tick}
              aria-hidden
              className="absolute top-0 bottom-0 w-px bg-brand-black/10"
              style={{ left: `${offset(tick)}%` }}
            />
          ))}

          {todayOffset !== null && (
            <div
              aria-hidden
              className="absolute top-0 bottom-0 w-px bg-brand-red/60"
              style={{ left: `${todayOffset}%` }}
            />
          )}

          <ul className="flex flex-col divide-y divide-brand-black/10">
            {bars.map((bar) => {
              const left = offset(bar.start);
              const width = Math.max(offset(bar.end) - left, 1);
              const startLabel = formatDate(bar.start);
              const endLabel = formatDate(bar.task.actualEnd ?? bar.task.plannedEnd);
              return (
                <li key={bar.task.id} className="flex flex-col gap-1 px-3 py-2">
                  <Link
                    href={`/admin/task-tracker/tasks/${bar.task.id}`}
                    className="text-sm text-brand-black underline"
                  >
                    {bar.task.name}
                  </Link>
                  {/* Full-bleed (-mx-3 cancels the row's px-3): bar offsets
                      and the week/today lines must share one coordinate
                      space, or bars land short of the line they mark.
                      Bars are decoration; the sentence below carries the same
                      information for screen readers and on paper. */}
                  <div className="relative -mx-3 h-4" aria-hidden>
                    <div
                      className={`absolute top-0 h-4 ${BAR_CLASSES[bar.task.status]}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                    {bar.overdue && (
                      <div
                        className="absolute top-0 h-4 border border-brand-red"
                        style={{
                          left: `${offset(bar.end)}%`,
                          width: `${Math.max(offset(today) - offset(bar.end), 1)}%`,
                          backgroundImage: OVERRUN_STRIPES,
                        }}
                      />
                    )}
                  </div>
                  <p className="text-sm text-brand-black/70">
                    {startLabel} – {endLabel} · {STATUS_LABELS[bar.task.status]}
                    {bar.overdue && <span className="text-brand-red"> · overdue</span>}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Only the statuses actually on the chart — a fixed six-item key
          would mostly be colours nobody can see here. */}
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-brand-black/70">
        {usedStatuses.map((status) => (
          <li key={status} className="flex items-center gap-2">
            <span aria-hidden className={`inline-block h-3 w-3 ${BAR_CLASSES[status]}`} />
            {STATUS_LABELS[status]}
          </li>
        ))}
        {bars.some((bar) => bar.overdue) && (
          <li className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-3 w-3 border border-brand-red"
              style={{ backgroundImage: OVERRUN_STRIPES }}
            />
            Overdue by this much
          </li>
        )}
      </ul>

      <p className="text-sm text-brand-black/70">
        Each label marks the start of a week
        {todayOffset !== null && <>; the red line is today ({formatDate(today)})</>}.
      </p>

      {undated.length > 0 && (
        <div className="text-sm text-brand-black/70">
          <p>
            Not shown — {undated.length === 1 ? "this task has" : "these tasks have"} no
            planned start and end date:
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {undated.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/task-tracker/tasks/${task.id}`}
                  className="text-brand-black underline"
                >
                  {task.name}
                </Link>
                <StatusBadge status={task.status} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
