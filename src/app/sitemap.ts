import type { MetadataRoute } from "next";
import { POLICY_DATES } from "./privacy-policy/dates";
import { LOCALES, localeHref } from "./privacy-policy/locales";
import { isPolicyServed } from "./privacy-policy/visibility";
import { SITE_URL, siteDirs, sitemapEntries } from "@/cms/site";
import { getOpportunitySitemapEntries } from "@/opportunities/data";
import { isClosed } from "@/opportunities/filter";

// Opportunities are DB-backed, so a newly-saved listing's sitemap entry needs this rendered
// per-request rather than once at build time.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Content pages are dated by their files' updatedAt; see sitemapEntries.
  const entries: MetadataRoute.Sitemap = sitemapEntries(siteDirs());

  // Opportunity detail pages have a dynamic segment, so sitemapEntries() (which
  // excludes any route with a `[` segment) never sees them; add them by hand. A closed
  // listing's page stays up but is noindex, so it is left out here too.
  const now = new Date();
  for (const opportunity of await getOpportunitySitemapEntries()) {
    if (isClosed(opportunity, now)) continue;
    entries.push({
      url: `${SITE_URL}/opportunities/${opportunity.slug}`,
      lastModified: new Date(opportunity.publishedAt),
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  // Only while the policy is actually served: a sitemap that lists a URL
  // returning 404 is an error in Search Console. Each language version lists
  // the others as hreflang alternates, matching the pages' own metadata.
  if (isPolicyServed()) {
    const languages = Object.fromEntries(
      LOCALES.map((locale) => [locale.code, `${SITE_URL}${localeHref(locale)}`]),
    );
    for (const locale of LOCALES) {
      entries.push({
        url: `${SITE_URL}${localeHref(locale)}`,
        lastModified: POLICY_DATES.lastUpdated
          ? new Date(POLICY_DATES.lastUpdated)
          : new Date(),
        changeFrequency: "yearly",
        priority: 0.3,
        alternates: { languages },
      });
    }
  }

  return entries;
}
