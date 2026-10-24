export type OpportunityType = "job" | "course";
export type CommitmentType = "full_time" | "part_time" | "contract" | "internship" | "fellowship";
export type CompCurrency = "GBP" | "USD" | "EUR";
export type CompPeriod = "year" | "month" | "week" | "day" | "hour";

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
  startDate?: string;
  endDate?: string;
  tags?: string[];
  applyUrl: string;
  applyLabel?: string;
  /** Where this listing was found, for reference, when it differs from `applyUrl`. */
  sourceUrl?: string;
  publishedAt: string;
};
