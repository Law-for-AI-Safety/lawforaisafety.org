import type { Locale } from "./locales";

/**
 * The policy's dates, held once and formatted per locale rather than written
 * into each translation's prose. Two reasons: publishing an update means
 * editing one line here instead of hunting the same date through every
 * language, and a date can never silently disagree between versions of a
 * legal document.
 *
 * ISO `YYYY-MM-DD`, or null while counsel hasn't set them. Null renders the
 * `[date]` placeholder, consistent with the other bracketed to-dos.
 */
export const POLICY_DATES: {
  lastUpdated: string | null;
  effectiveFrom: string | null;
} = {
  lastUpdated: null,
  effectiveFrom: null,
};

/** Shown in place of an unset date, in every language. */
export const DATE_PLACEHOLDER = "[date]";

/**
 * Formats an ISO date in the reader's language: "26 August 2026" in English,
 * "26 augustus 2026" in Dutch.
 *
 * The date is built and formatted in UTC. `new Date("2026-08-26")` parses as
 * UTC midnight, so formatting it in a timezone behind UTC would render the
 * previous day, i.e. a one-day-wrong effective date on a legal document.
 */
export function formatPolicyDate(iso: string | null, locale: Locale): string {
  if (!iso) return DATE_PLACEHOLDER;

  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat(locale.dateTag, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
