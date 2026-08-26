import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PolicyDocument from "../PolicyDocument";
import { SUB_PATH_LOCALES, localeFromSegment } from "../locales";
import { policyMetadata } from "../metadata";

/**
 * Translations of the policy, one URL per language. English is not served
 * here, since it lives at the bare `/privacy-policy` (see `../page.tsx`), so
 * `/privacy-policy/en` 404s rather than becoming a second address for the
 * same text.
 */
export function generateStaticParams() {
  return SUB_PATH_LOCALES.map((locale) => ({ locale: locale.segment }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: segment } = await params;
  const locale = localeFromSegment(segment);
  if (!locale) notFound();
  return policyMetadata(locale);
}

export default async function PrivacyPolicyLocalePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: segment } = await params;
  const locale = localeFromSegment(segment);
  if (!locale) notFound();

  return <PolicyDocument locale={locale} />;
}
