export const HONEYPOT_FIELD_NAME = "website";
export const FORM_RENDERED_AT_FIELD_NAME = "renderedAt";

const MIN_FILL_TIME_MS = 2000;

/**
 * True if the submission looks like a bot: honeypot filled in, or submitted
 * faster than a human plausibly could. Caller should still show the normal
 * success response either way — never reveal that a submission was flagged.
 */
export function looksLikeBot(formData: FormData): boolean {
  const honeypot = formData.get(HONEYPOT_FIELD_NAME);
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return true;
  }

  const renderedAt = formData.get(FORM_RENDERED_AT_FIELD_NAME);
  if (typeof renderedAt === "string") {
    const renderedAtMs = Number(renderedAt);
    if (Number.isFinite(renderedAtMs)) {
      return Date.now() - renderedAtMs < MIN_FILL_TIME_MS;
    }
  }

  // No timestamp field at all — treat as suspicious rather than trusting it.
  return true;
}
