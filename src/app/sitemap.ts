import type { MetadataRoute } from "next";
import { POLICY_DATES } from "./privacy-policy/dates";
import { LOCALES, localeHref } from "./privacy-policy/locales";
import { isPolicyServed } from "./privacy-policy/visibility";

export const dynamic = "force-static";

const SITE_URL = "https://lawforaisafety.org";

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/red-lines-dialogue`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];

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
