/**
 * Where a listing's applications go: a web address, or for an organisation with no application
 * portal, an email address. Either is kept in `applyUrl` as a URL, an email address as
 * `mailto:` and the address, so every reader can use it as a link as it is. Client-safe, so
 * forms can show an email address without its `mailto:`.
 */

const MAILTO = "mailto:";
/** One address, with nothing a mail link could read as a second recipient, a header or a path. */
const EMAIL_ADDRESS = /^[^\s@,;:/?#<>()"'\\[\]]+@[^\s@,;:/?#<>()"'\\[\]]+\.[^\s@,;:/?#<>()"'\\[\].]+$/;

/** An http(s) address that parses as a URL. */
export function isWebAddress(value: string): boolean {
  return /^https?:\/\//i.test(value) && URL.canParse(value);
}

/** The email address a `mailto:` apply link sends to, or undefined for any other link. */
export function applyEmail(link: string): string | undefined {
  if (link.slice(0, MAILTO.length).toLowerCase() !== MAILTO) return undefined;
  const address = link.slice(MAILTO.length);
  return EMAIL_ADDRESS.test(address) ? address : undefined;
}

/** A link applications can go to: a web address, or `mailto:` and one email address. */
export function isApplyLink(link: string): boolean {
  return isWebAddress(link) || applyEmail(link) !== undefined;
}

/** What was typed, trimmed, with a bare email address made a `mailto:` link. */
export function normaliseApplyLink(value: string): string {
  const trimmed = value.trim();
  return EMAIL_ADDRESS.test(trimmed) ? `${MAILTO}${trimmed}` : trimmed;
}

/** The link as a form shows it: an email address without its `mailto:`. */
export function applyLinkForForm(link: string): string {
  return applyEmail(link) ?? link;
}
