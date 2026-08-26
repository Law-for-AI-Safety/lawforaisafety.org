import ContentPage from "../ContentPage";
import LanguageToggle from "./LanguageToggle";
import { POLICY_CONTENT } from "./content";
import { POLICY_DATES, formatPolicyDate } from "./dates";
import type { Locale } from "./locales";
import { H2 } from "./styles";
import { SECTION_IDS } from "./types";

/**
 * A date from `dates.ts`, written out in the reader's language and wrapped in
 * `<time>` so the machine-readable ISO value travels with the human one. An
 * unset date renders as the bare `[date]` placeholder with no `<time>`, since
 * there is nothing yet to encode.
 */
function PolicyDate({ iso, locale }: { iso: string | null; locale: Locale }) {
  const formatted = formatPolicyDate(iso, locale);
  if (!iso) return <>{formatted}</>;
  return <time dateTime={iso}>{formatted}</time>;
}

/**
 * Renders one locale's policy text. Section numbering, ordering, and layout
 * come from `SECTION_IDS`, not from the content files, so every translation
 * is guaranteed to have the same clauses in the same order under the same
 * anchors, so `/privacy-policy#retention` and `/privacy-policy/nl#retention`
 * point at the same clause.
 *
 * The root layout hard-codes `<html lang="en">`, so the article carries its
 * own `lang` for locales other than English; without it screen readers and
 * browser translation would read Dutch text with English pronunciation rules.
 */
export default function PolicyDocument({ locale }: { locale: Locale }) {
  const content = POLICY_CONTENT[locale.code];

  return (
    <ContentPage gap={6}>
      <article lang={locale.tag} className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 rounded-sm border border-brand-red/30 bg-brand-red/5 px-5 py-4">
          {content.reviewNotice}
        </div>

        <div className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="font-sans text-4xl text-brand-black">
              {content.title}
            </h1>
            <p className="text-lg text-brand-black/80">
              {content.dateLabels.lastUpdated}:{" "}
              <PolicyDate iso={POLICY_DATES.lastUpdated} locale={locale} />.{" "}
              {content.dateLabels.effectiveFrom}:{" "}
              <PolicyDate iso={POLICY_DATES.effectiveFrom} locale={locale} />
            </p>
          </div>
          <LanguageToggle
            current={locale}
            label={content.languageSwitcherLabel}
          />
        </div>

        <div className="flex flex-col gap-4">{content.intro}</div>

        <nav aria-label={content.tocLabel} className="flex flex-col gap-2 pt-2">
          <h2 className="text-base font-light text-brand-black/60">
            {content.tocHeading}
          </h2>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-lg">
            {SECTION_IDS.map((id, i) => (
              <li key={id}>
                <a href={`#${id}`} className="text-brand-navy underline">
                  {i + 1}. {content.sections[id].label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {SECTION_IDS.map((id, i) => (
          <section
            key={id}
            id={id}
            className="flex flex-col gap-4 pt-8 border-t border-brand-black/10 last:pb-4"
          >
            <h2 className={H2}>
              {i + 1}. {content.sections[id].label}
            </h2>
            {content.sections[id].body}
          </section>
        ))}
      </article>
    </ContentPage>
  );
}
