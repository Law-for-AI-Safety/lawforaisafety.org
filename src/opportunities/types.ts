export type OpportunityType = "job" | "course";

export type Opportunity = {
  id: string;
  slug: string;
  type: OpportunityType;
  title: string;
  org: string;
  orgUrl?: string;
  summary: string;
  description: string;
  location: string;
  remote: boolean;
  commitment?: string;
  compensation?: string;
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
