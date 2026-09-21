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
 * Reads Netlify's own `CONTEXT` variable, the same one `src/lib/email.ts` uses
 * to tell production apart. It is unset locally, which counts as not
 * production.
 */
export const POLICY_PUBLISHED = false;

/** Whether this deploy should serve the policy and link to it. */
export function isPolicyServed(): boolean {
  return POLICY_PUBLISHED || process.env.CONTEXT !== "production";
}

/** Whether the banner and counsel notes should render. */
export function showDraftMarkup(): boolean {
  return !POLICY_PUBLISHED;
}
