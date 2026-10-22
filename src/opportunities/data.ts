import { defaultOpportunitiesDir, readValidOpportunityFiles } from "./files";
import type { Opportunity } from "./types";

/**
 * Opportunities live as one file each under `content/opportunities/`, admin-managed through
 * pull requests (`src/opportunities/github-publish.ts`). Read fresh off disk on every call, the
 * same way `src/cms/content-files.ts` reads CMS pages, so this is server/build-only code. A
 * file that isn't a complete, valid listing (e.g. a pending import's stub merged too early) is
 * skipped rather than crashing every page that reads this - see `readValidOpportunityFiles`.
 */

export function getOpportunities(): Opportunity[] {
  return readValidOpportunityFiles(defaultOpportunitiesDir());
}

export function getOpportunityBySlug(slug: string): Opportunity | null {
  return getOpportunities().find((opportunity) => opportunity.slug === slug) ?? null;
}
