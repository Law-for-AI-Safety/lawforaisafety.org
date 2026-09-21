import Link from "next/link";
import { LOCALES, localeHref, type Locale } from "./locales";

/**
 * Segmented links between the published translations of this policy. Plain
 * `<Link>`s rather than a client-side toggle: each language is a real URL, so
 * this works without JavaScript, can be copied out of the address bar, and
 * lets search engines index each version (see `locales.ts`).
 */
export default function LanguageToggle({
  current,
  label,
}: {
  current: Locale;
  label: string;
}) {
  if (LOCALES.length < 2) return null;

  return (
    <nav
      aria-label={label}
      className="flex shrink-0 flex-row items-center rounded-sm border border-brand-black/20"
    >
      {LOCALES.map((locale) => {
        const isCurrent = locale.code === current.code;
        return (
          <Link
            key={locale.code}
            href={localeHref(locale)}
            hrefLang={locale.tag}
            lang={locale.tag}
            aria-current={isCurrent ? "true" : undefined}
            title={locale.name}
            className={`px-3 py-1.5 text-base transition-colors first:rounded-l-sm last:rounded-r-sm ${
              isCurrent
                ? "bg-brand-navy text-brand-white"
                : "text-brand-black/60 hover:bg-brand-black/5 hover:text-brand-black"
            }`}
          >
            {locale.label}
            <span className="sr-only">, {locale.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
