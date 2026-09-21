import { isProductionDeploy } from "@/lib/deploy-context";

/**
 * The one switch that decides whether the privacy policy is public.
 *
 * While `POLICY_PUBLISHED` is false the policy is a working draft:
 * - production (Netlify `CONTEXT=production`) serves a 404 at every policy URL
 *   and the footer link is hidden, so a half-finished legal document is never
 *   reachable there;
 * - deploy previews and local dev still serve it, with the "draft for legal
 *   review" banner and the counsel notes, marked `noindex`, so it can be
 *   reviewed.
 *
 * Publishing is flipping this to true, after counsel has signed off and the
 * values in `organisation.ts` and `dates.ts` are filled in. That single change
 * makes it public everywhere, removes the banner and every counsel note, and
 * lets it be indexed.
 *
 * Production is told apart with `isProductionDeploy()` (the Netlify deploy
 * context captured at build time), the same check `src/lib/email.ts` uses.
 * Netlify's raw `CONTEXT` variable must not be read here: it is undefined at
 * function runtime, which would serve the draft on any dynamically rendered
 * page in production. Locally the context is empty, which counts as not
 * production.
 */
/*
 * Published on 21 September 2026 as an INTERIM version, ahead of counsel's
 * sign-off, so that signup never runs without a notice people can read.
 * "Interim" needs no separate text: while the enterprise number in
 * `organisation.ts` is null, the policy uses its "being established, not yet
 * registered" wording, and every unfilled value sits either in the registered
 * wording (not rendered) or in a CounselNote (not rendered once published),
 * so nothing bracketed reaches the public page.
 *
 * When the details arrive, nothing here changes. Fill the `null`s in
 * `src/app/organisation.ts` (registered address, legal form, enterprise
 * number, competent court): the policy and the footer switch to the
 * registered wording by themselves. Then bump `dates.ts`, and resolve and
 * delete the CounselNotes in `content/*.tsx`. To read those notes again in
 * the meantime, set this to false locally — never on main.
 */
export const POLICY_PUBLISHED = true;

/** Whether this deploy should serve the policy and link to it. */
export function isPolicyServed(): boolean {
  return POLICY_PUBLISHED || !isProductionDeploy();
}

/** Whether the banner and counsel notes should render. */
export function showDraftMarkup(): boolean {
  return !POLICY_PUBLISHED;
}
