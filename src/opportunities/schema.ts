import { z } from "zod";
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
const isoDate = (label: string) => z.string().regex(ISO_DATE, `${label} must be an ISO date (YYYY-MM-DD)`);
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

export const opportunitySchema = z
  .object({
    slug: z.string().regex(SLUG, "Slug may use only lowercase letters, digits and single hyphens"),
    type: z.enum(["job", "course"]),
    title: text("Title", 200),
    org: text("Organisation", 200),
    orgUrl: url("Organisation URL").optional(),
    summary: text("Summary", 500),
    description: text("Description"),
    location: text("Location", 200),
    remote: z.boolean(),
    commitment: text("Commitment", 100).optional(),
    compensation: text("Compensation", 200).optional(),
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

export type OpportunityInput = z.input<typeof opportunitySchema>;
// A compile-time check that the schema's output matches the hand-written `Opportunity` type.
type _AssertShapeMatches = z.infer<typeof opportunitySchema> extends Opportunity
  ? Opportunity extends z.infer<typeof opportunitySchema>
    ? true
    : never
  : never;
const _shapeCheck: _AssertShapeMatches = true;
void _shapeCheck;

/** A file that is still just a URL, waiting for the import script to fill in the rest. */
export const stubSchema = z.object({ url: url("URL") }).strict();
export type Stub = z.infer<typeof stubSchema>;

export function isStub(value: unknown): value is Stub {
  return stubSchema.safeParse(value).success;
}

/**
 * What the import script asks `claude -p` to extract from a fetched page: everything except
 * `slug` and `publishedAt` (computed by the script, never by the model) and `sourceUrl` (the
 * script already knows it - it's the stub's own `url`).
 */
export const extractionSchema = opportunitySchema.omit({ slug: true, publishedAt: true, sourceUrl: true });
export type Extraction = z.infer<typeof extractionSchema>;

/** Parses and validates an opportunity's full content. Throws a readable `ZodError` on failure. */
export function parseOpportunity(value: unknown): Opportunity {
  return opportunitySchema.parse(value);
}
