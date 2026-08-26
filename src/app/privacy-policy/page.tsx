import type { Metadata } from "next";
import PolicyDocument from "./PolicyDocument";
import { DEFAULT_LOCALE } from "./locales";
import { policyMetadata } from "./metadata";

/**
 * The policy in the default language (English), kept at the bare
 * `/privacy-policy` so the footer link and any links already shared keep
 * working. Other languages live at `/privacy-policy/<segment>`. See
 * `[locale]/page.tsx` and `locales.ts`.
 *
 * Still a working draft for legal review: the text is derived from how the
 * signup/vetting flow actually behaves in code (see signup-feature-spec.md),
 * and the remaining `[...]` items need counsel. The route is unlinked from
 * primary nav until reviewed.
 */
export const metadata: Metadata = policyMetadata(DEFAULT_LOCALE);

export default function PrivacyPolicyPage() {
  return <PolicyDocument locale={DEFAULT_LOCALE} />;
}
