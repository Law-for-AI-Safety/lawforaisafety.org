import { parseSettings } from "./settings";
import type { Tuning } from "./tuning";

/** The most items one export or rescore covers; a longer stretch is asked for in parts. */
export const ITEM_LIMIT = 2000;

/** How far back an export or rescore looks when no `since` is given. */
export const DEFAULT_SINCE_DAYS = 90;

/** `since` as a day (YYYY-MM-DD), or DEFAULT_SINCE_DAYS before `now` when absent. */
export function parseSince(value: unknown, now: Date): { ok: true; since: Date } | { ok: false; problem: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, since: new Date(now.getTime() - DEFAULT_SINCE_DAYS * 24 * 60 * 60 * 1000) };
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false, problem: "since must be a day, as YYYY-MM-DD." };
  const since = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(since.getTime()) || since.toISOString().slice(0, 10) !== value) return { ok: false, problem: "since must be a real day." };
  return { ok: true, since };
}

/** A request's JSON body when it is an object, else null. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const body: unknown = await request.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

/**
 * Topics and trusted outlets from a request body, checked as the settings form checks them. The
 * recipient cannot be sent this way: only a technical admin, signed in, may change it.
 */
export function parseTuning(body: Record<string, unknown> | null): { ok: true; tuning: Tuning } | { ok: false; problem: string } {
  if (body === null) return { ok: false, problem: "The body must be a JSON object." };
  if ("recipient" in body) return { ok: false, problem: "The recipient cannot be changed through the API." };
  const { topics, trustedOutlets } = body;
  // A new topic may leave out its id: it is given one from its name, as on the form.
  const withIds = Array.isArray(topics) ? topics.map((t: unknown) => (typeof t === "object" && t !== null && !("id" in t) ? { ...t, id: "" } : t)) : topics;
  const parsed = parseSettings({ topics: withIds, trustedOutlets, recipient: null });
  if (!parsed.ok) return parsed;
  return { ok: true, tuning: { topics: parsed.settings.topics, trustedOutlets: parsed.settings.trustedOutlets } };
}
