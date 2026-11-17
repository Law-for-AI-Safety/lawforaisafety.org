/** The site's address, which the email's links and logo are made absolute against. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://lawforaisafety.org").replace(/\/$/, "");
}

/**
 * Where the unsubscribe link points in the preview and in a test copy, which do not go through
 * Brevo's list and so have no per-contact link. The real campaign carries Brevo's merge tag.
 */
export const TEST_UNSUBSCRIBE_HREF = "https://lawforaisafety.org/newsletter#test-unsubscribe-link";
