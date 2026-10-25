import { OPPORTUNITY_TYPES } from "./kinds";
import { COMMITMENT_TYPES, COMP_CURRENCIES, COMP_PERIODS } from "./schema";
import type { Opportunity } from "./types";

/**
 * Turning an admin form's raw JSON body into an opportunity's fields - shared by the create and
 * update API routes, which otherwise differ only in how they get `slug` and `publishedAt` (a
 * freshly computed slug and today's date on create, the existing ones kept as-is on update).
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

export type OpportunityFields = Omit<Opportunity, "id" | "slug" | "publishedAt">;

export type ParsedOpportunityBody = { ok: true; fields: OpportunityFields } | { ok: false; error: string };

export function opportunityFieldsFromBody(body: Record<string, unknown>): ParsedOpportunityBody {
  const title = str(body.title);
  const org = str(body.org);
  const applyUrl = str(body.applyUrl);
  if (!title || !org || !applyUrl) {
    return { ok: false, error: "Title, organisation and apply URL are required" };
  }
  return {
    ok: true,
    fields: {
      type: oneOf(OPPORTUNITY_TYPES)(body.type) ?? "job",
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
