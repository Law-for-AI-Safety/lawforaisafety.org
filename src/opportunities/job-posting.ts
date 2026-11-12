import { SITE_URL } from "@/cms/site";
import { closingDate, isClosed } from "./filter";
import type { CommitmentType, PublishedOpportunity } from "./types";

/**
 * schema.org `JobPosting` for a listing's page, following Google's job posting structured data
 * rules, which make the page eligible for Google's job search results.
 *
 * Only jobs and fellowships get one: Google takes job postings only, and courses, events and
 * projects are not jobs. A listing gets none once it has closed (Google requires an expired
 * posting to drop its markup or carry a past `validThrough`), nor when it names no place at
 * all, since Google then requires a location the listing doesn't have. `baseSalary` is left
 * out: Google takes it only from the employer, and the board lists other organisations' roles.
 */

export type JobPostingJsonLd = Record<string, unknown> & { "@type": "JobPosting" };

const EMPLOYMENT_TYPE: Record<CommitmentType, string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  internship: "INTERN",
  fellowship: "OTHER",
};

/** A listing closes when its closing day ends Anywhere on Earth (see `isClosed`). */
const END_OF_DAY_ANYWHERE_ON_EARTH = "T23:59:59-12:00";

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** The description as HTML, one paragraph per blank-line-separated block, as the page shows it. */
function descriptionHtml(description: string): string {
  return description
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

/**
 * Where the work is. A listing based in a country is located there; a remote one is marked
 * `TELECOMMUTE` as well, open to applicants in that country. A remote listing with no single
 * base country is `TELECOMMUTE` alone, applicants anywhere. Null for one that is neither.
 */
function location(opportunity: PublishedOpportunity): Record<string, unknown> | null {
  const { locationCountry, locationCity, remote } = opportunity;
  const global = locationCountry === "GLOBAL";
  if (global && !remote) return null;
  return {
    ...(!global && {
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          ...(locationCity && { addressLocality: locationCity }),
          addressCountry: locationCountry,
        },
      },
    }),
    ...(remote && {
      jobLocationType: "TELECOMMUTE",
      ...(!global && { applicantLocationRequirements: { "@type": "Country", name: locationCountry } }),
    }),
  };
}

/** The listing's `JobPosting`, or null when it should carry none (see above). */
export function jobPostingJsonLd(opportunity: PublishedOpportunity, now: Date): JobPostingJsonLd | null {
  if (opportunity.type !== "job" && opportunity.type !== "fellowship") return null;
  if (isClosed(opportunity, now)) return null;
  const place = location(opportunity);
  if (!place) return null;

  const closes = closingDate(opportunity, now);
  return {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: opportunity.title,
    description: descriptionHtml(opportunity.description),
    url: `${SITE_URL}/opportunities/${opportunity.slug}`,
    datePosted: opportunity.publishedAt,
    ...(closes && { validThrough: `${closes}${END_OF_DAY_ANYWHERE_ON_EARTH}` }),
    ...(opportunity.commitment && { employmentType: EMPLOYMENT_TYPE[opportunity.commitment] }),
    hiringOrganization: {
      "@type": "Organization",
      name: opportunity.org,
      ...(opportunity.orgUrl && { sameAs: opportunity.orgUrl }),
    },
    ...place,
  };
}

/**
 * JSON for an inline `<script type="application/ld+json">`. `<` is escaped so no value, such as
 * a description holding `</script>`, can end the script element early.
 */
export function jsonLdScript(data: object): string {
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}
