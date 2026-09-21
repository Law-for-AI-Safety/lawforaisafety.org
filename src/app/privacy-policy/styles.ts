/**
 * Shared type scale for the policy document. Locale content files import
 * these so translations stay visually identical to each other. The only
 * thing that should differ between locales is the words.
 */
export const H2 =
  "font-sans text-2xl md:text-3xl font-light text-brand-black scroll-mt-32";
export const H3 = "text-xl font-light text-brand-black";
export const P = "text-lg text-brand-black/80";
export const UL = "list-disc pl-6 flex flex-col gap-2 text-lg text-brand-black/80";
export const LINK = "underline";
/** Wrapper for a heading-plus-prose block inside a section. */
export const SUBSECTION = "flex flex-col gap-3";
/**
 * A to-do addressed to counsel, not policy text the reader is bound by. Set
 * apart by a rule and muted type rather than bold, so it can't be mistaken
 * for an emphasised clause. Every one of these should be resolved and the
 * block deleted before the policy is published.
 */
export const NOTE =
  "border-l-2 border-brand-red/30 pl-4 text-base text-brand-black/60";
