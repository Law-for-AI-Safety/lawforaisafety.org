/**
 * When a newsletter may be scheduled for: far enough ahead that Brevo has it queued in time
 * and an admin can still cancel, and not so far that it is surely a typo.
 */
export const MIN_LEAD_MINUTES = 10;
export const MAX_LEAD_DAYS = 180;

/** How long a hand-over to Brevo may take before it counts as interrupted. */
export const STUCK_AFTER_MS = 5 * 60_000;

/** Why `at` cannot be a send time, judged at `now`, or null when it can. */
export function scheduleProblem(at: Date, now: Date): string | null {
  if (Number.isNaN(at.getTime())) return "Choose a date and time.";
  const lead = at.getTime() - now.getTime();
  if (lead < MIN_LEAD_MINUTES * 60_000) {
    return `Choose a time at least ${MIN_LEAD_MINUTES} minutes from now, or send it now instead.`;
  }
  if (lead > MAX_LEAD_DAYS * 86_400_000) return `Choose a time within ${MAX_LEAD_DAYS} days.`;
  return null;
}

function parts(date: Date, timeZone: string): Record<string, string> {
  const fields = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(fields.map((part) => [part.type, part.value]));
}

/** The zone's offset from UTC at `date`, in minutes (60 for BST). */
export function offsetMinutes(date: Date, timeZone: string): number {
  const p = parts(date, timeZone);
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((local - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** `date` as the value of a `datetime-local` input showing the time in `timeZone`. */
export function formatLocalInput(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** "UTC+1", "UTC−5", "UTC+5:30" or "UTC". */
export function offsetLabel(date: Date, timeZone: string): string {
  const minutes = offsetMinutes(date, timeZone);
  if (minutes === 0) return "UTC";
  const sign = minutes > 0 ? "+" : "−";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** A send time in full, with its zone named: "Friday, 20 November 2026, 09:00 (Europe/London, UTC)". */
export function describeTime(date: Date, timeZone: string): string {
  const text = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${text.replace(" at ", ", ")} (${timeZone}, ${offsetLabel(date, timeZone)})`;
}
