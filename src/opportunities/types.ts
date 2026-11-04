import type { OpportunityType } from "./kinds";

export type { OpportunityType };
export type CommitmentType = "full_time" | "part_time" | "contract" | "internship" | "fellowship";
export type CompCurrency = "GBP" | "USD" | "EUR";
export type CompPeriod = "year" | "month" | "week" | "day" | "hour";
/** A draft is seen only in the admin, until an admin publishes it. */
export type OpportunityStatus = "draft" | "published";

export type Opportunity = {
  id: string;
  slug: string;
  type: OpportunityType;
  title: string;
  org: string;
  orgUrl?: string;
  summary: string;
  description: string;
  /** An ISO 3166-1 alpha-2 country code, or the sentinel "GLOBAL" for roles with no single base country. */
  locationCountry: string;
  locationCity?: string;
  /** Caveats that don't fit country/city, e.g. required time-zone overlap or an in-person onboarding trip. */
  locationNote?: string;
  remote: boolean;
  commitment?: CommitmentType;
  compMin?: number;
  compMax?: number;
  compCurrency?: CompCurrency;
  compPeriod?: CompPeriod;
  /** Caveats that don't fit the structured range, e.g. "benchmarked locally outside London". */
  compNote?: string;
  deadline?: string;
  /** An event's date; for anything else, when the role, fellowship, project or course begins. */
  startDate?: string;
  /** A multi-day event's last day; for anything else, when it ends. */
  endDate?: string;
  tags?: string[];
  applyUrl: string;
  applyLabel?: string;
  /** Where this listing was found, for reference, when it differs from `applyUrl`. */
  sourceUrl?: string;
  status: OpportunityStatus;
  /** The day it went public. Unset while a draft. */
  publishedAt?: string;
};

/** A listing the public may see: what the board, listing pages and sitemap read. */
export type PublishedOpportunity = Opportunity & { status: "published"; publishedAt: string };

export function isPublished(opportunity: Opportunity): opportunity is PublishedOpportunity {
  return opportunity.status === "published" && opportunity.publishedAt !== undefined;
}
