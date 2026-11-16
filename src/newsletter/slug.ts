import { slugify } from "../opportunities/slug";

/**
 * The start of an issue's web address: its subject and the day (UTC) it is to go out, such as
 * `november-update-2026-11-20`. A subject with no letters or digits to keep becomes `newsletter`.
 * The date keeps it clear of the fixed pages beside it (`/newsletter/confirm` and the like).
 */
export function issueSlugBase(subject: string, sendAt: Date): string {
  return `${slugify(subject) || "newsletter"}-${sendAt.toISOString().slice(0, 10)}`;
}

/** The issue's page on the site. */
export const issuePath = (slug: string) => `/newsletter/${slug}`;

/** The archive of every issue on the site. */
export const ARCHIVE_PATH = "/newsletter";
