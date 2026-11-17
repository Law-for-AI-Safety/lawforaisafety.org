import { inlineTree, parseRichText, type InlineNode, type Run } from "../cms/rich-text";
import { escapeHtml } from "../lib/escape-html";

/**
 * The newsletter email: the fields an admin writes, their checks, and the HTML Brevo sends.
 * Pure, so the editor's live preview renders exactly what the server hands to Brevo.
 *
 * Inline styles only, as in the transactional emails (src/lib/email.ts): email clients strip
 * <style> blocks, and Outlook does not inherit styles reliably. The logo is the PNG export,
 * since Outlook desktop does not render SVG.
 */

export type NewsletterFields = { subject: string; previewText: string; body: string };

export const SUBJECT_MAX = 150;
export const PREVIEW_TEXT_MAX = 200;
export const BODY_MAX = 100_000;

/** Brevo's merge tag for the contact's own unsubscribe link, filled in per recipient. */
export const BREVO_UNSUBSCRIBE_TAG = "{{ unsubscribe }}";

const COLOURS = {
  page: "#f3f0ec",
  card: "#ffffff",
  text: "#16161d",
  navy: "#1b334c",
  red: "#9b1c1f",
  rule: "#e5e2dc",
};

export type FieldProblems = Partial<Record<keyof NewsletterFields, string>>;

/** What stops these fields being sent, by field; empty when they are ready. */
export function newsletterProblems(fields: NewsletterFields): FieldProblems {
  const problems: FieldProblems = {};
  const subject = fields.subject.trim();
  if (subject === "") problems.subject = "Add a subject line.";
  else if (subject.length > SUBJECT_MAX) problems.subject = `Keep the subject under ${SUBJECT_MAX} characters.`;
  if (fields.previewText.trim().length > PREVIEW_TEXT_MAX) {
    problems.previewText = `Keep the preview text under ${PREVIEW_TEXT_MAX} characters.`;
  }
  if (fields.body.trim() === "") problems.body = "Write the newsletter.";
  else if (fields.body.length > BODY_MAX) problems.body = "The newsletter is too long to send.";
  else {
    try {
      parseRichText(fields.body);
    } catch (e) {
      problems.body = `The text has a formatting problem: ${(e as Error).message}.`;
    }
  }
  return problems;
}


/** Site paths (`/field-building`) become full addresses, since an email has no site to be relative to. */
function absoluteHref(href: string, siteUrl: string): string {
  return href.startsWith("/") ? `${siteUrl}${href}` : href;
}

function renderInline(nodes: InlineNode[], siteUrl: string): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return escapeHtml(node.text);
        case "bold":
          return `<strong>${renderInline(node.children, siteUrl)}</strong>`;
        case "italic":
          return `<em>${renderInline(node.children, siteUrl)}</em>`;
        case "wavy":
          // Clients without wavy decorations show a plain underline.
          return `<span style="text-decoration:underline;text-decoration-style:wavy;text-decoration-color:${COLOURS.red};">${renderInline(node.children, siteUrl)}</span>`;
        case "link":
          return `<a href="${escapeHtml(absoluteHref(node.href, siteUrl))}" style="color:${COLOURS.red};text-decoration:underline;">${renderInline(node.children, siteUrl)}</a>`;
      }
    })
    .join("");
}

const line = (runs: Run[], siteUrl: string) => renderInline(inlineTree(runs), siteUrl);

/** The body as email HTML. Throws on text that is not valid rich text. */
export function renderNewsletterBody(body: string, siteUrl: string): string {
  return parseRichText(body)
    .map((block) =>
      block.type === "paragraph"
        ? `<p style="margin:0 0 16px;">${line(block.runs, siteUrl)}</p>`
        : `<ul style="margin:0 0 16px;padding-left:24px;">${block.items
            .map((item) => `<li style="margin:0 0 8px;">${line(item, siteUrl)}</li>`)
            .join("")}</ul>`,
    )
    .join("\n");
}

/**
 * The whole email. `unsubscribeHref` is Brevo's merge tag in the campaign, and a stand-in in
 * the preview and the test copy, which go to one admin rather than through the list. A body
 * that cannot be read yet (mid-edit) renders as a notice, so the preview never breaks.
 */
export function renderNewsletterHtml(
  fields: NewsletterFields,
  { siteUrl, unsubscribeHref }: { siteUrl: string; unsubscribeHref: string },
): string {
  let body: string;
  try {
    body = fields.body.trim() === "" ? "" : renderNewsletterBody(fields.body, siteUrl);
  } catch {
    body = `<p style="margin:0;color:${COLOURS.red};">The text has a formatting problem; see the editor.</p>`;
  }
  const subject = escapeHtml(fields.subject.trim());
  const preview = escapeHtml(fields.previewText.trim());
  const site = escapeHtml(siteUrl);
  const host = escapeHtml(siteUrl.replace(/^https?:\/\//, ""));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLOURS.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preview}</div>
<div style="background-color:${COLOURS.page};padding:32px 16px;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:600px;margin:0 auto;background-color:${COLOURS.card};border-radius:4px;overflow:hidden;">
    <div style="padding:24px 32px;border-bottom:4px solid ${COLOURS.navy};">
      <a href="${site}" style="text-decoration:none;"><img src="${site}/logo-email.png" alt="Law for AI Safety" width="160" style="display:block;height:auto;border:0;" /></a>
    </div>
    <div style="padding:32px 32px 16px;color:${COLOURS.text};font-size:16px;line-height:1.6;">
      <h1 style="margin:0 0 24px;font-size:26px;line-height:1.3;font-weight:normal;color:${COLOURS.navy};">${subject}</h1>
      ${body}
    </div>
    <div style="padding:24px 32px;border-top:1px solid ${COLOURS.rule};font-size:12px;line-height:1.6;color:${COLOURS.navy};">
      <p style="margin:0 0 8px;">You are receiving this because you signed up for the Law for AI Safety newsletter at <a href="${site}" style="color:${COLOURS.navy};">${host}</a>.</p>
      <p style="margin:0;"><a href="${escapeHtml(unsubscribeHref)}" style="color:${COLOURS.navy};">Unsubscribe</a></p>
    </div>
  </div>
</div>
</body>
</html>`;
}
