export type OpportunityType = "job" | "course";

export type Opportunity = {
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
  /** The page a listing was imported from, when it differs from `applyUrl` (e.g. a job ad whose own "Apply" button goes elsewhere). */
  sourceUrl?: string;
  publishedAt: string;
};
