import { addDaysISO, formatDate } from "./dates";
import type { TaskTrackerStatus } from "./status";

export type DependencyTiming = {
  id: string;
  name: string;
  status: TaskTrackerStatus;
  plannedEnd: string | null;
  actualEnd: string | null;
};

export type StartSuggestion = {
  /** The first day this task could sensibly start. */
  date: string;
  /** The dependency that decides it — the last one to finish. */
  blockerName: string;
  /** True when that dependency's end date is a plan, not a fact. */
  planned: boolean;
};

/**
 * The earliest start date consistent with the tasks this one waits on: the
 * day after the last of them ends. A finished dependency contributes the day
 * it actually ended, an unfinished one its planned end — so the suggestion
 * tracks reality as a project slips.
 *
 * Dependencies with no end date at all are skipped; there's nothing to
 * derive from them.
 */
export function suggestStartAfterDependencies(
  dependencies: DependencyTiming[],
): StartSuggestion | null {
  let latest: { end: string; name: string; planned: boolean } | null = null;
  for (const dependency of dependencies) {
    const finished = dependency.status === "done" || dependency.status === "cancelled";
    const end = finished ? (dependency.actualEnd ?? dependency.plannedEnd) : dependency.plannedEnd;
    if (!end) continue;
    if (!latest || end > latest.end) {
      latest = { end, name: dependency.name, planned: !finished };
    }
  }
  if (!latest) return null;
  return {
    date: addDaysISO(latest.end, 1),
    blockerName: latest.name,
    planned: latest.planned,
  };
}

/** Wording for the planned-start field: a button when it needs fixing, a note otherwise. */
export function startSuggestionCopy(
  suggestion: StartSuggestion | null,
): { date: string; label: string; note: string } | null {
  if (!suggestion) return null;
  const date = formatDate(suggestion.date);
  return {
    date: suggestion.date,
    label: `Use ${date} — the day after ${suggestion.blockerName} ends`,
    note: `Can't start before ${date}, when ${suggestion.blockerName} ends.`,
  };
}

/** Sentence for a planned start that begins before its dependencies end. */
export function startsTooEarlyWarning(
  plannedStart: string,
  suggestion: StartSuggestion | null,
): string | null {
  if (!suggestion || !plannedStart || plannedStart >= suggestion.date) return null;
  return `Starts before ${suggestion.blockerName} is ${
    suggestion.planned ? "due to finish" : "recorded as finished"
  } (${formatDate(suggestion.date)} at the earliest).`;
}
