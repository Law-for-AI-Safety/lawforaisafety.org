import type { Opportunity } from "./types";

/**
 * Turning an admin form's raw JSON body into an opportunity's fields - shared by the create and
 * update API routes, which otherwise differ only in how they get `slug` and `publishedAt` (a
 * freshly computed slug and today's date on create, the existing ones kept as-is on update).
 */

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strOrUndefined = (v: unknown): string | undefined => str(v) || undefined;

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
      type: body.type === "course" ? "course" : "job",
      title,
      org,
      orgUrl: strOrUndefined(body.orgUrl),
      summary: str(body.summary),
      description: str(body.description),
      location: str(body.location),
      remote: Boolean(body.remote),
      commitment: strOrUndefined(body.commitment),
      compensation: strOrUndefined(body.compensation),
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
