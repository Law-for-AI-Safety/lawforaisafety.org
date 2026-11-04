import { OPPORTUNITY_TYPES } from "./kinds";
import { COMMITMENT_TYPES, COMP_CURRENCIES, COMP_PERIODS, OPPORTUNITY_STATUSES } from "./schema";
import type { Opportunity, OpportunityStatus } from "./types";

/**
 * Turning an admin form's raw JSON body into an opportunity's fields - shared by the create and
 * update API routes, which otherwise differ only in how they get `slug`, `status` and
 * `publishedAt` (a freshly computed slug on create, the existing ones kept as-is on update).
 */

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strOrUndefined = (v: unknown): string | undefined => str(v) || undefined;
/** Number inputs arrive as strings (or blank) from a form body; blank/non-numeric becomes undefined, left for the schema to require alongside currency/period. */
const numOrUndefined = (v: unknown): number | undefined => {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const trimmed = str(v);
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
};
const oneOf =
  <T extends string>(values: readonly T[]) =>
  (v: unknown): T | undefined => {
    const s = strOrUndefined(v);
    return s && (values as readonly string[]).includes(s) ? (s as T) : undefined;
  };

export type OpportunityFields = Omit<Opportunity, "id" | "slug" | "status" | "publishedAt">;

/**
 * A request's JSON body, or null when it isn't a JSON object (`null`, a number, an array, or
 * not JSON at all), for the route to refuse with a 400 rather than fail reading a field of it.
 */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const body: unknown = await request.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

/** Every key `opportunityFieldsFromBody` reads, so a route can tell a body with no fields at all. */
const FIELD_KEYS = [
  "type", "title", "org", "orgUrl", "summary", "description", "locationCountry", "locationCity", "locationNote",
  "remote", "commitment", "compMin", "compMax", "compCurrency", "compPeriod", "compNote", "deadline", "startDate",
  "endDate", "tags", "applyUrl", "applyLabel", "sourceUrl",
] as const satisfies readonly (keyof OpportunityFields)[];
// A compile-time check that FIELD_KEYS names every field.
const _allFieldKeys: Exclude<keyof OpportunityFields, (typeof FIELD_KEYS)[number]> extends never ? true : never = true;
void _allFieldKeys;

/** Whether a body has any of a listing's editable fields, as opposed to only `status`, `slug` or the like. */
export function hasOpportunityFields(body: Record<string, unknown>): boolean {
  return FIELD_KEYS.some((key) => key in body);
}

export type ParsedStatus = { ok: true; status: OpportunityStatus | undefined } | { ok: false; error: string };

/** A body's optional `status`. Left out, it is undefined, for the route to choose its default. */
export function statusFromBody(body: Record<string, unknown>): ParsedStatus {
  if (body.status === undefined) return { ok: true, status: undefined };
  const status = OPPORTUNITY_STATUSES.find((value) => value === body.status);
  if (!status) return { ok: false, error: `Status must be one of: ${OPPORTUNITY_STATUSES.join(", ")}` };
  return { ok: true, status };
}

export type ParsedOpportunityBody = { ok: true; fields: OpportunityFields } | { ok: false; error: string };

export function opportunityFieldsFromBody(body: Record<string, unknown>): ParsedOpportunityBody {
  const title = str(body.title);
  const org = str(body.org);
  const applyUrl = str(body.applyUrl);
  if (!title || !org || !applyUrl) {
    return { ok: false, error: "Title, organisation and apply URL are required" };
  }
  // No fallback: a misspelt type would otherwise go live as the wrong kind of listing.
  const type = oneOf(OPPORTUNITY_TYPES)(body.type);
  if (!type) {
    return { ok: false, error: `Type must be one of: ${OPPORTUNITY_TYPES.join(", ")}` };
  }
  return {
    ok: true,
    fields: {
      type,
      title,
      org,
      orgUrl: strOrUndefined(body.orgUrl),
      summary: str(body.summary),
      description: str(body.description),
      locationCountry: str(body.locationCountry),
      locationCity: strOrUndefined(body.locationCity),
      locationNote: strOrUndefined(body.locationNote),
      remote: Boolean(body.remote),
      commitment: oneOf(COMMITMENT_TYPES)(body.commitment),
      compMin: numOrUndefined(body.compMin),
      compMax: numOrUndefined(body.compMax),
      compCurrency: oneOf(COMP_CURRENCIES)(body.compCurrency),
      compPeriod: oneOf(COMP_PERIODS)(body.compPeriod),
      compNote: strOrUndefined(body.compNote),
      deadline: strOrUndefined(body.deadline),
      startDate: strOrUndefined(body.startDate),
      endDate: strOrUndefined(body.endDate),
      tags: Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string" && t.trim() !== "") : undefined,
      applyUrl,
      applyLabel: strOrUndefined(body.applyLabel),
      sourceUrl: strOrUndefined(body.sourceUrl),
    },
  };
}
