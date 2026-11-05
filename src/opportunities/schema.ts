import { z } from "zod";
import { COUNTRIES } from "./countries";
import { OPPORTUNITY_TYPES } from "./kinds";
import type { Opportunity, OpportunityRound } from "./types";

/**
 * The shape of an opportunity file, `content/opportunities/<slug>.json`. One file per listing,
 * key order as declared here so printing a parsed value gives a deterministic file (same
 * convention as `src/cms/schema.ts`'s content pages).
 *
 * A draft is as complete and valid as a published listing: being a draft only keeps it off the
 * public site until an admin publishes it, which is when it gets its `publishedAt`.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Matches the format, then rejects anything Date rolls over to a different day (e.g. "2024-02-30"). */
export function isRealCalendarDate(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
const isoDate = (label: string) =>
  z
    .string()
    // Stops there, so a value in the wrong format isn't also reported as not a real date.
    .regex(ISO_DATE, { message: `${label} must be an ISO date (YYYY-MM-DD)`, abort: true })
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
export const OPPORTUNITY_STATUSES = ["draft", "published"] as const;
/** Sentinel `locationCountry` for roles with no single base country (fully remote, worldwide). */
export const GLOBAL = "GLOBAL";
const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));
const countryCode = () =>
  z.string().refine((v) => v === GLOBAL || COUNTRY_CODES.has(v), "Country must be a valid ISO country code, or GLOBAL");

/** Most rounds a listing may have: more than any real course runs at once, few enough to list. */
export const MAX_ROUNDS = 20;

const roundSchema = z
  .object({
    label: text("Label", 50).optional(),
    deadline: isoDate("Deadline").optional(),
    startDate: isoDate("Start date").optional(),
    endDate: isoDate("End date").optional(),
  })
  .strict();

/** Every field a round takes, for the request body's parser to read and name. */
export const ROUND_KEYS = roundSchema.keyof().options;

/** The checks one round's dates need, reported under that round's place in `rounds`. */
function checkRound(type: string | undefined, round: OpportunityRound, index: number, ctx: z.RefinementCtx) {
  const path = ["rounds", index];
  if (round.deadline === undefined && round.startDate === undefined && round.endDate === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A round needs at least one date", path });
  }
  if (type === "event" && round.startDate === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "An event's round needs its date (start date)", path: [...path, "startDate"] });
  }
  if (round.startDate !== undefined && round.endDate !== undefined && round.endDate < round.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "End date can't be before the start date", path: [...path, "endDate"] });
  }
}

/** Cross-field checks that a single field's own validator can't express. */
function checkConsistency(
  val: {
    compMin?: number;
    compMax?: number;
    compCurrency?: unknown;
    compPeriod?: unknown;
    locationCountry?: string;
    locationCity?: unknown;
    type?: string;
    deadline?: string;
    startDate?: string;
    endDate?: string;
    rounds?: OpportunityRound[];
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
  // With rounds, every date lives in a round, so there is one place to read when it closes.
  if (val.rounds !== undefined) {
    if (val.deadline !== undefined || val.startDate !== undefined || val.endDate !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A listing with rounds keeps its dates in its rounds: leave its own deadline, start date and end date blank",
        path: ["rounds"],
      });
    }
    val.rounds.forEach((round, index) => checkRound(val.type, round, index, ctx));
  }
  // An event closes after its date, so without one it would stay on the board for good.
  if (val.type === "event" && val.rounds === undefined && val.startDate === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "An event needs its date (start date)", path: ["startDate"] });
  }
  if (val.startDate !== undefined && val.endDate !== undefined && val.endDate < val.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "End date can't be before the start date", path: ["endDate"] });
  }
}

const opportunityObjectSchema = z
  .object({
    id: z.string(),
    slug: z.string().regex(SLUG, "Slug may use only lowercase letters, digits and single hyphens"),
    type: z.enum(OPPORTUNITY_TYPES),
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
    rounds: z
      .array(roundSchema)
      .min(1, "Rounds can't be an empty list: leave them out for a listing with single dates")
      .max(MAX_ROUNDS, `A listing can have at most ${MAX_ROUNDS} rounds`)
      .optional(),
    tags: z.array(text("Tag", 50)).optional(),
    applyUrl: url("Apply URL"),
    applyLabel: text("Apply label", 50).optional(),
    sourceUrl: url("Source URL").optional(),
    status: z.enum(OPPORTUNITY_STATUSES),
    publishedAt: isoDate("Published date").optional(),
  })
  .strict();

export const opportunitySchema = opportunityObjectSchema.superRefine(checkConsistency).superRefine((val, ctx) => {
  if (val.status === "published" && val.publishedAt === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A published listing needs its published date", path: ["publishedAt"] });
  }
  if (val.status === "draft" && val.publishedAt !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A draft has no published date until it is published", path: ["publishedAt"] });
  }
});

export type OpportunityInput = z.input<typeof opportunityObjectSchema>;

/**
 * An opportunity's editable fields: everything but `id`/`slug` (identity), and `status` and
 * `publishedAt`, which only change when a draft is published.
 */
export const opportunityFieldsSchema = opportunityObjectSchema
  .omit({ id: true, slug: true, status: true, publishedAt: true })
  .superRefine(checkConsistency);
// A compile-time check that the schema's output matches the hand-written `Opportunity` type.
type _AssertShapeMatches = z.infer<typeof opportunitySchema> extends Opportunity
  ? Opportunity extends z.infer<typeof opportunitySchema>
    ? true
    : never
  : never;
const _shapeCheck: _AssertShapeMatches = true;
void _shapeCheck;

/**
 * One readable line per problem. A problem with a round names which, counting from 1, since
 * every round has the same fields.
 */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map(({ path, message }) =>
      path[0] === "rounds" && typeof path[1] === "number" ? `Round ${path[1] + 1}: ${message}` : message,
    )
    .join("; ");
}

/** Parses and validates an opportunity's full content. Throws a readable `ZodError` on failure. */
export function parseOpportunity(value: unknown): Opportunity {
  return opportunitySchema.parse(value);
}
