export const HONEYPOT_FIELD_NAME = "website";
export const FORM_RENDERED_AT_FIELD_NAME = "renderedAt";

const MIN_FILL_TIME_MS = 2000;

/**
 * True if the submission looks like a bot: honeypot filled in, or submitted
 * faster than a human plausibly could. Caller should still show the normal
 * success response either way — never reveal that a submission was flagged.
 *
 * The form's timestamp is filled in by the browser after the form mounts
 * (see RenderedAtField), and the prerendered HTML carries it empty. So a
 * missing, empty, zero or non-numeric value means the page's script never
 * ran, as when a bot posts the scraped HTML, and counts as a bot.
 */
export function looksLikeBot(formData: FormData): boolean {
  const honeypot = formData.get(HONEYPOT_FIELD_NAME);
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return true;
  }

  const renderedAt = formData.get(FORM_RENDERED_AT_FIELD_NAME);
  if (typeof renderedAt !== "string" || !/^\d+$/.test(renderedAt)) {
    return true;
  }
  const renderedAtMs = Number(renderedAt);
  if (renderedAtMs <= 0) {
    return true;
  }
  return Date.now() - renderedAtMs < MIN_FILL_TIME_MS;
}
