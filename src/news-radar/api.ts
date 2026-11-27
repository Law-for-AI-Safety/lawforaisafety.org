import { parseSettings } from "./settings";
import type { Tuning } from "./tuning";

/**
 * The most items one export or rescore covers. When a stretch holds more, the newest are returned
 * and `truncated` is set; the rest are asked for with `until` set to an earlier day.
 */
export const ITEM_LIMIT = 2000;

/** How far back an export or rescore looks when no `since` is given. */
export const DEFAULT_SINCE_DAYS = 90;

type Parsed<T> = { ok: true } & T | { ok: false; problem: string };

/** A day as YYYY-MM-DD, as midnight UTC. */
function parseDay(name: string, value: unknown): Parsed<{ day: Date }> {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false, problem: `${name} must be a day, as YYYY-MM-DD.` };
  const day = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value) return { ok: false, problem: `${name} must be a real day.` };
  return { ok: true, day };
}

const absent = (value: unknown) => value === undefined || value === null || value === "";

/**
 * The stretch of first-seen days an export or rescore covers: from `since` (default
 * DEFAULT_SINCE_DAYS before `now`) up to, but not including, `until` (default: no end).
 */
export function parseRange(sinceValue: unknown, untilValue: unknown, now: Date): Parsed<{ since: Date; until: Date | null }> {
  let since = new Date(now.getTime() - DEFAULT_SINCE_DAYS * 24 * 60 * 60 * 1000);
  if (!absent(sinceValue)) {
    const parsed = parseDay("since", sinceValue);
    if (!parsed.ok) return parsed;
    since = parsed.day;
  }
  if (absent(untilValue)) return { ok: true, since, until: null };
  const until = parseDay("until", untilValue);
  if (!until.ok) return until;
  if (until.day <= since) return { ok: false, problem: "until must be after since." };
  return { ok: true, since, until: until.day };
}

/** A request's JSON body when it is an object, else null. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const body: unknown = await request.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

/** A new topic may leave out its id (it is given one from its name, as on the form) and its empty lists. */
const withDefaults = (t: unknown) =>
  typeof t === "object" && t !== null && !Array.isArray(t) ? { id: "", require: [], exclude: [], ...t } : t;

/**
 * Topics and trusted outlets from a request body, checked as the settings form checks them. The
 * recipient cannot be sent this way: only a technical admin, signed in, may change it. Other
 * fields (`updatedAt`, `since`) are the caller's to read.
 */
export function parseTuning(body: Record<string, unknown> | null): Parsed<{ tuning: Tuning }> {
  if (body === null) return { ok: false, problem: "The body must be a JSON object." };
  if ("recipient" in body) return { ok: false, problem: "The recipient cannot be changed through the API." };
  const { topics, trustedOutlets } = body;
  const parsed = parseSettings({ topics: Array.isArray(topics) ? topics.map(withDefaults) : topics, trustedOutlets, recipient: null });
  if (!parsed.ok) return parsed;
  return { ok: true, tuning: { topics: parsed.settings.topics, trustedOutlets: parsed.settings.trustedOutlets } };
}

/**
 * The `updatedAt` that settings get returned, which a save must send back so that a change made
 * since (on the settings page, say) is not overwritten: null when the settings were never saved.
 */
export function parseBasedOn(value: unknown): Parsed<{ basedOn: Date | null }> {
  if (value === null) return { ok: true, basedOn: null };
  const basedOn = typeof value === "string" ? new Date(value) : null;
  if (!basedOn || Number.isNaN(basedOn.getTime())) {
    return { ok: false, problem: "Send the updatedAt that settings get returned, so a change made since is not overwritten." };
  }
  return { ok: true, basedOn };
}
