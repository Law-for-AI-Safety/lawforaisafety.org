import Image from "next/image";
import Link from "next/link";
import { detailValue } from "./organisation";

/**
 * Statutory identification line. Article 2:20 of the Companies and
 * Associations Code requires a Belgian legal person's name, legal form,
 * registered office, enterprise number, and register with its competent court
 * on its website; Article III.74 of the Code of Economic Law separately
 * requires the enterprise number on publications. The footer is the
 * conventional home for it, since the duty is site-wide rather than tied to
 * any one page.
 *
 * The values come from `organisation.ts`, the same source the privacy policy
 * reads, so the two can't disagree. Unlike the policy, which shows `[legal
 * form]` style placeholders because it is still an unpublished draft, this
 * renders on live pages: anything counsel hasn't supplied is omitted rather
 * than shown, and the whole line stays hidden until there is an enterprise
 * number to publish.
 */
function identificationParts(): string[] {
  const name = detailValue("entityName", "en");
  const legalForm = detailValue("legalForm", "en");
  const address = detailValue("registeredAddress", "en");
  const enterpriseNumber = detailValue("enterpriseNumber", "en");
  const court = detailValue("registerCourt", "en");

  if (!enterpriseNumber) return [];

  return [
    [name, legalForm].filter(Boolean).join(" "),
    address,
    `Enterprise number ${enterpriseNumber}`,
    court && `RPR ${court}`,
  ].filter((part): part is string => Boolean(part));
}

export default function Footer() {
  const identification = identificationParts();

  return (
    <footer className="bg-brand-black px-8 md:px-16 py-12">
      <div className="max-w-4xl mx-auto flex flex-col gap-4">
        <div className="flex flex-row justify-between items-center gap-6">
          <Image
            src="/logo.svg"
            alt="Law for AI Safety"
            width={160}
            height={48}
            className="w-36 brightness-0 invert opacity-40"
          />
          <p className="text-lg font-light text-brand-white/85 flex flex-wrap items-center gap-x-3">
            <span>© {new Date().getFullYear()} Law for AI Safety. All rights reserved.</span>
            <Link href="/privacy-policy" className="underline hover:text-brand-white">
              Privacy Policy
            </Link>
          </p>
        </div>
        {identification.length > 0 && (
          <p className="text-sm font-light text-brand-white/50">
            {identification.join(" · ")}
          </p>
        )}
      </div>
    </footer>
  );
}
