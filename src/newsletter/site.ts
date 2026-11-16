/** The site's address, which the email's links and logo are made absolute against. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://lawforaisafety.org").replace(/\/$/, "");
}

/**
 * Where the unsubscribe link points in the preview and in a test copy, which do not go through
 * Brevo's list and so have no per-contact link. The real campaign carries Brevo's merge tag.
 */
export const TEST_UNSUBSCRIBE_HREF = "https://lawforaisafety.org/newsletter#test-unsubscribe-link";

/**
 * Where "View in browser" points in the preview and in a test copy. The issue's own address is
 * fixed only when it is handed to Brevo, since it carries the day it goes out.
 */
export const TEST_VIEW_IN_BROWSER_HREF = "https://lawforaisafety.org/newsletter#test-view-in-browser-link";
