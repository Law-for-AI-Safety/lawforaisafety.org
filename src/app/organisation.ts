import type { LocaleCode } from "./privacy-policy/locales";

/**
 * Who this organisation legally is: the values counsel has to supply, held
 * once and read by everything that needs them. Filling in the entity name
 * here fills it in on every language version of the privacy policy and in the
 * site footer at the same time, so no two places can end up naming a
 * different entity, address, or supervisory authority.
 *
 * This lives outside `privacy-policy/` because the statutory identification
 * duty (Article 2:20 of the Companies and Associations Code) is site-wide,
 * not specific to that page.
 *
 * `value: null` renders the placeholder in the privacy policy, so an unfilled
 * blank is visible on a page that is still a draft. The footer is on every
 * page including live ones, so it omits anything unset instead: see
 * `detailValue`.
 *
 * A value may be a plain string when it reads the same in every language (a
 * company name, a postal address, an email), or an object keyed by locale
 * when it genuinely differs: "Belgium" is "België" in Dutch, and a
 * supervisory authority usually has an official name per language. Anything
 * missing for a given locale falls back to the placeholder rather than
 * silently showing another language's wording.
 */
export type OrganisationDetail = {
  /** Shown until `value` is filled in. English in every locale, so `[` stays a reliable grep. */
  placeholder: string;
  value: string | Partial<Record<LocaleCode, string>> | null;
};

export const ORGANISATION_DETAILS = {
  entityName: {
    placeholder: "[legal entity name]",
    value: "Law for AI Safety Institute",
  },
  jurisdiction: {
    placeholder: "[jurisdiction of incorporation]",
    value: { en: "Belgium", nl: "België" },
  },
  registeredAddress: {
    placeholder: "[registered address]",
    value: null,
  },
  /**
   * Legal form, enterprise number, and register are required on a Belgian
   * legal person's website by Article 2:20 of the Companies and Associations
   * Code, whichever non-profit form is chosen. Written out rather than
   * abbreviated, since the abbreviation differs by language (VZW/ASBL).
   */
  legalForm: {
    placeholder: "[legal form]",
    value: null,
  },
  enterpriseNumber: {
    placeholder: "[enterprise number]",
    value: null,
  },
  /** The court of the registered office, following "RPR"/"RPM". */
  registerCourt: {
    placeholder: "[competent court]",
    value: null,
  },
  /**
   * The territory the transfer wording is written against. A Belgian entity
   * is governed by the GDPR, so the line that matters to a reader is which
   * transfers leave the EEA.
   */
  dataProtectionArea: {
    placeholder: "[UK/EEA]",
    value: { en: "EEA", nl: "EER" },
  },
  /**
   * Belgium's supervisory authority. Its name is official in each language,
   * hence the per-locale values rather than one string. Name, address, email,
   * and both domains verified against the authority's own site on 26 August
   * 2026; re-check before publishing if much time has passed.
   */
  supervisoryAuthority: {
    placeholder: "[relevant supervisory authority]",
    value: {
      en: "the Belgian Data Protection Authority (Gegevensbeschermingsautoriteit)",
      nl: "de Gegevensbeschermingsautoriteit",
    },
  },
  supervisoryAuthorityAddress: {
    placeholder: "[supervisory authority address]",
    value: {
      en: "Drukpersstraat 35, 1000 Brussels, Belgium",
      nl: "Drukpersstraat 35, 1000 Brussel, België",
    },
  },
  supervisoryAuthorityEmail: {
    placeholder: "[supervisory authority email]",
    value: "contact@apd-gba.be",
  },
  /**
   * The authority runs a separate domain per language, all three confirmed
   * live. A French version, when one is added, wants
   * www.autoriteprotectiondonnees.be ("Autorite de protection des donnees").
   * Note the English site does not translate every page: some deep links fall
   * back to "not available in English", so link the homepage rather than an
   * inner page.
   */
  supervisoryAuthorityWebsite: {
    placeholder: "[supervisory authority website]",
    value: {
      en: "www.dataprotectionauthority.be",
      nl: "www.gegevensbeschermingsautoriteit.be",
    },
  },
  contactEmail: {
    placeholder: "[contact email]",
    value: "info@lawforaisafety.org",
  },
} satisfies Record<string, OrganisationDetail>;

export type DetailKey = keyof typeof ORGANISATION_DETAILS;

/**
 * The filled-in value, or null when counsel hasn't supplied one. Use this
 * anywhere a placeholder must not be shown to the public, such as the footer,
 * which appears on live pages rather than only on the policy draft.
 */
export function detailValue(
  key: DetailKey,
  locale: LocaleCode,
): string | null {
  const detail: OrganisationDetail = ORGANISATION_DETAILS[key];
  if (detail.value === null) return null;
  if (typeof detail.value === "string") return detail.value;
  return detail.value[locale] ?? null;
}

function resolve(detail: OrganisationDetail, locale: LocaleCode): string {
  if (detail.value === null) return detail.placeholder;
  if (typeof detail.value === "string") return detail.value;
  return detail.value[locale] ?? detail.placeholder;
}

/**
 * Every detail resolved for one language, ready to drop into prose:
 * `const d = detailsFor("en")` then `{d.entityName}`.
 */
export function detailsFor(locale: LocaleCode): Record<DetailKey, string> {
  return Object.fromEntries(
    Object.entries(ORGANISATION_DETAILS).map(([key, detail]) => [
      key,
      resolve(detail, locale),
    ]),
  ) as Record<DetailKey, string>;
}
