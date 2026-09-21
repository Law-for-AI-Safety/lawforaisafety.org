import type { ReactNode } from "react";

/**
 * Canonical section order for the privacy policy, shared by every locale.
 * Sections are numbered in the rendered page from this array, so reordering
 * here reorders (and renumbers) all translations at once. The order follows
 * the structure of the source document this policy was adapted from: who we
 * are, what we collect, why, how long, who with, how we protect it, your
 * rights, and how to exercise them.
 *
 * `PolicyContent["sections"]` is a `Record` over these ids, so adding an id
 * here is a compile error in every locale file until that locale supplies the
 * new section. That is deliberate: a legal document must not silently ship a
 * translation that is missing a clause.
 */
export const SECTION_IDS = [
  "who-we-are",
  "data-we-collect",
  "cv-handling",
  "how-we-use-it",
  "legal-basis",
  "retention",
  "who-we-share-with",
  "international-transfers",
  "cookies",
  "security",
  "your-rights",
  "exercising-rights",
  "complaints",
  "children",
  "changes",
  "contact",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export type PolicySection = {
  /** Heading text, also used as the link text in the on-page contents list. */
  label: string;
  body: ReactNode;
};

export type PolicyContent = {
  /** Browser/tab title and `<h1>`. */
  title: string;
  /** Short description used for the page's `<meta name="description">`. */
  description: string;
  /**
   * Labels for the dateline under the `<h1>`. The dates themselves live in
   * `dates.ts` and are formatted per locale, so translations supply only the
   * wording around them, so no date is ever retyped in a translation.
   */
  dateLabels: {
    lastUpdated: string;
    effectiveFrom: string;
  };
  /** Draft-for-legal-review banner. Remove once counsel has signed off. */
  reviewNotice: ReactNode;
  /** Opening paragraph(s), before the contents list. */
  intro: ReactNode;
  /** Heading above the on-page contents list. */
  tocHeading: string;
  /** Accessible label for the contents `<nav>`. */
  tocLabel: string;
  /** Accessible label for the language switcher. */
  languageSwitcherLabel: string;
  sections: Record<SectionId, PolicySection>;
};
