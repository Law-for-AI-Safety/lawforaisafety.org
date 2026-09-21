import type { Metadata } from "next";
import { POLICY_CONTENT } from "./content";
import { LOCALES, localeHref, type Locale } from "./locales";
import { POLICY_PUBLISHED } from "./visibility";

/**
 * Per-locale metadata. Each version declares itself canonical at its own URL
 * and lists the others as `hreflang` alternates, which is what tells search
 * engines these are translations of one document rather than duplicates.
 */
export function policyMetadata(locale: Locale): Metadata {
  const content = POLICY_CONTENT[locale.code];

  return {
    title: content.title,
    description: content.description,
    // A draft must not be indexed, on previews or anywhere else it renders.
    robots: POLICY_PUBLISHED ? undefined : { index: false, follow: false },
    alternates: {
      canonical: localeHref(locale),
      languages: Object.fromEntries(
        LOCALES.map((l) => [l.tag, localeHref(l)]),
      ),
    },
  };
}
