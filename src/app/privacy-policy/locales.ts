/**
 * Languages this policy is published in.
 *
 * The default locale is served at the bare `/privacy-policy` URL (so the
 * existing footer link and any links already in the wild keep working);
 * every other locale gets `/privacy-policy/<segment>`. Each language is its
 * own URL rather than a client-side toggle so that a specific version can be
 * linked, bookmarked, cited, and indexed. For a legal document, "which
 * version was I shown" needs to be answerable from the URL alone.
 *
 * To add a language (e.g. Swiss French): add an entry here, add the matching
 * content file under `content/`, and register it in `content/index.ts`. The
 * `Record<LocaleCode, …>` in that registry makes the compiler point at the
 * missing file.
 */
export const LOCALES = [
  {
    code: "en",
    /** URL segment after /privacy-policy; empty string = the bare URL. */
    segment: "",
    /** `hreflang` / `lang` attribute value. */
    tag: "en",
    /**
     * Locale used to format dates. Regional, unlike `tag`: bare "en" formats
     * as "August 26, 2026", and the policy's readership expects day-first.
     * `hreflang` stays region-neutral so the page isn't scoped to one country.
     */
    dateTag: "en-GB",
    /** Switcher button text. */
    label: "EN",
    /** Language name in its own language, for the switcher's accessible name. */
    name: "English",
  },
  {
    code: "nl",
    segment: "nl",
    tag: "nl",
    dateTag: "nl-BE",
    label: "NL",
    name: "Nederlands",
  },
] as const;

export type Locale = (typeof LOCALES)[number];
export type LocaleCode = Locale["code"];

export const DEFAULT_LOCALE_CODE: LocaleCode = "en";

export function localeHref(locale: Locale): string {
  return locale.segment ? `/privacy-policy/${locale.segment}` : "/privacy-policy";
}

export const DEFAULT_LOCALE: Locale = LOCALES.find(
  (l) => l.code === DEFAULT_LOCALE_CODE,
)!;

/**
 * Every locale that has its own URL segment, i.e. all but the default, which
 * is served from the bare `/privacy-policy`.
 */
export const SUB_PATH_LOCALES = LOCALES.filter((l) => l.segment !== "");

/**
 * Resolves a `/privacy-policy/<segment>` route param to a locale. Returns
 * undefined for anything that isn't a known language so the page can 404,
 * rather than serving the policy from an unlimited number of addresses.
 * `/privacy-policy/en` deliberately 404s: English lives at the bare URL, and
 * a second address for the same text is a duplicate a search engine (or a
 * reader citing a version) has to disambiguate.
 */
export function localeFromSegment(segment: string): Locale | undefined {
  return SUB_PATH_LOCALES.find((l) => l.segment === segment);
}
