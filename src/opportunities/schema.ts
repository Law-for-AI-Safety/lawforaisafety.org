import { z } from "zod";
import { COUNTRIES } from "./countries";
import type { Opportunity } from "./types";

/**
 * The shape of an opportunity file, `content/opportunities/<slug>.json`. One file per listing,
 * key order as declared here so printing a parsed value gives a deterministic file (same
 * convention as `src/cms/schema.ts`'s content pages).
 *
 * Unlike the CMS, there is no draft mode: an admin action either produces a complete, valid
 * file or it doesn't go out as a pull request at all.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Matches the format, then rejects anything Date rolls over to a different day (e.g. "2024-02-30"). */
function isRealCalendarDate(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
const isoDate = (label: string) =>
  z
    .string()
    .regex(ISO_DATE, `${label} must be an ISO date (YYYY-MM-DD)`)
    .refine(isRealCalendarDate, `${label} must be a real calendar date`);
const url = (label: string) =>
  z
    .string()
    .url(`${label} must be a valid URL`)
    .refine((v) => /^https?:\/\//i.test(v), `${label} must start with http:// or https://`);
const text = (label: string, max = 20_000) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`);

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const COMMITMENT_TYPES = ["full_time", "part_time", "contract", "internship", "fellowship"] as const;
export const COMP_CURRENCIES = ["GBP", "USD", "EUR"] as const;
export const COMP_PERIODS = ["year", "month", "week", "day", "hour"] as const;
/** Sentinel `locationCountry` for roles with no single base country (fully remote, worldwide). */
export const GLOBAL = "GLOBAL";
const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));
const countryCode = () =>
  z.string().refine((v) => v === GLOBAL || COUNTRY_CODES.has(v), "Country must be a valid ISO country code, or GLOBAL");

/** Cross-field checks that a single field's own validator can't express. */
function checkConsistency(
  val: {
    compMin?: number;
    compMax?: number;
    compCurrency?: unknown;
    compPeriod?: unknown;
    locationCountry?: string;
    locationCity?: unknown;
  },
  ctx: z.RefinementCtx,
) {
  const hasAmount = val.compMin !== undefined || val.compMax !== undefined;
  if (hasAmount && val.compCurrency === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Compensation currency is required when an amount is set", path: ["compCurrency"] });
  }
  if (hasAmount && val.compPeriod === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Compensation period is required when an amount is set", path: ["compPeriod"] });
  }
  if (val.compMin !== undefined && val.compMax !== undefined && val.compMax < val.compMin) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Compensation max must be at least the min", path: ["compMax"] });
  }
  if (val.locationCountry === GLOBAL && val.locationCity !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A Global listing can't also have a city", path: ["locationCity"] });
  }
}

const opportunityObjectSchema = z
  .object({
    id: z.string(),
    slug: z.string().regex(SLUG, "Slug may use only lowercase letters, digits and single hyphens"),
    type: z.enum(["job", "course"]),
    title: text("Title", 200),
    org: text("Organisation", 200),
    orgUrl: url("Organisation URL").optional(),
    summary: text("Summary", 500),
    description: text("Description"),
    locationCountry: countryCode(),
    locationCity: text("City", 100).optional(),
    locationNote: text("Location note", 200).optional(),
    remote: z.boolean(),
    commitment: z.enum(COMMITMENT_TYPES).optional(),
    compMin: z.number().min(0, "Compensation min can't be negative").optional(),
    compMax: z.number().min(0, "Compensation max can't be negative").optional(),
    compCurrency: z.enum(COMP_CURRENCIES).optional(),
    compPeriod: z.enum(COMP_PERIODS).optional(),
    compNote: text("Compensation note", 200).optional(),
    deadline: isoDate("Deadline").optional(),
    startDate: isoDate("Start date").optional(),
    endDate: isoDate("End date").optional(),
    tags: z.array(text("Tag", 50)).optional(),
    applyUrl: url("Apply URL"),
    applyLabel: text("Apply label", 50).optional(),
    sourceUrl: url("Source URL").optional(),
    publishedAt: isoDate("Published date"),
  })
  .strict();

export const opportunitySchema = opportunityObjectSchema.superRefine(checkConsistency);

export type OpportunityInput = z.input<typeof opportunityObjectSchema>;

/** An opportunity's editable fields: everything but `id`/`slug` (identity) and `publishedAt` (set once, on create). */
export const opportunityFieldsSchema = opportunityObjectSchema
  .omit({ id: true, slug: true, publishedAt: true })
  .superRefine(checkConsistency);
// A compile-time check that the schema's output matches the hand-written `Opportunity` type.
type _AssertShapeMatches = z.infer<typeof opportunitySchema> extends Opportunity
  ? Opportunity extends z.infer<typeof opportunitySchema>
    ? true
    : never
  : never;
const _shapeCheck: _AssertShapeMatches = true;
void _shapeCheck;

/** Parses and validates an opportunity's full content. Throws a readable `ZodError` on failure. */
export function parseOpportunity(value: unknown): Opportunity {
  return opportunitySchema.parse(value);
}
