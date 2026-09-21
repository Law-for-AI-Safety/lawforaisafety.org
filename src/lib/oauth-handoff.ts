/**
 * Sends the applicant's browser on to the sign-in provider after the apply
 * form has been posted to us.
 *
 * This is a small page that navigates, not a 303, on purpose. Chrome applies
 * the page's CSP `form-action` to every hop of a form submission's redirect
 * chain, and a provider's sign-in can bounce through hosts we don't control
 * or know in advance (regional domains, cookie-sync hops). Allowlisting them
 * is guesswork that breaks in production with "Sending form data to … violates
 * form-action" and nothing on screen. A 200 ends the form submission here;
 * the navigation that follows is an ordinary one, so `form-action` can stay
 * at 'self' alone.
 *
 * `location.replace` keeps this page out of history, so Back from the
 * provider returns to the form rather than re-posting it. The meta refresh
 * and the link are fallbacks for a browser with scripting off.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function oauthHandoffResponse(
  authorizeUrl: string,
  providerLabel: "LinkedIn" | "Google",
): Response {
  const href = escapeHtml(authorizeUrl);
  // JSON string literal, with `<` escaped so the value can't close the script element.
  const scriptUrl = JSON.stringify(authorizeUrl).replaceAll("<", "\\u003c");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Taking you to ${providerLabel}…</title>
<noscript><meta http-equiv="refresh" content="0;url=${href}"></noscript>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #f3f0ec; color: #16161d; font-family: Georgia, 'Times New Roman', serif; font-size: 20px; }
  main { padding: 24px; text-align: center; }
  a { color: #1b334c; }
</style>
</head>
<body>
<main>
  <p>Taking you to ${providerLabel}…</p>
  <p><a href="${href}">Continue to ${providerLabel}</a> if nothing happens.</p>
</main>
<script>location.replace(${scriptUrl});</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
