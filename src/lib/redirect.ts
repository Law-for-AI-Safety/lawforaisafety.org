/**
 * 303 to a path on this site, as a *relative* Location header.
 *
 * Never build a redirect from `request.url`. On Netlify the handler sees the
 * deploy's internal address (https://<deploy-id>--<site>.netlify.app/...), not
 * the address the visitor used, so `new URL(path, request.url)` sends them to
 * that internal host: off the real domain, away from their cookies, and — with
 * a `form-action 'self'` CSP — blocked outright by Chrome mid form post. A
 * relative Location is resolved by the browser against the address it actually
 * requested, which is right everywhere: production, previews, localhost.
 *
 * Only same-site paths are accepted, so this can't become an open redirect if
 * a caller ever passes something derived from input.
 */
export function seeOther(path: string): Response {
  const safePath = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return new Response(null, { status: 303, headers: { Location: safePath } });
}
