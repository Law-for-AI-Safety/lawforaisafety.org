import { describe, expect, it } from "vitest";
import {
  BREVO_UNSUBSCRIBE_TAG,
  newsletterProblems,
  renderNewsletterBody,
  renderNewsletterHtml,
  SUBJECT_MAX,
  PREVIEW_TEXT_MAX,
  BODY_MAX,
} from "./template";
import { escapeHtml } from "../lib/escape-html";

const SITE = "https://lawforaisafety.test";
const ok = { subject: "November update", previewText: "What we did", body: "Hello **all**." };

describe("newsletterProblems", () => {
  it("passes a finished newsletter, and preview text is optional", () => {
    expect(newsletterProblems(ok)).toEqual({});
    expect(newsletterProblems({ ...ok, previewText: "" })).toEqual({});
  });

  it("names each field that stops it being sent", () => {
    expect(newsletterProblems({ subject: " ", previewText: "x".repeat(PREVIEW_TEXT_MAX + 1), body: "" })).toEqual({
      subject: "Add a subject line.",
      previewText: `Keep the preview text under ${PREVIEW_TEXT_MAX} characters.`,
      body: "Write the newsletter.",
    });
    expect(newsletterProblems({ ...ok, subject: "x".repeat(SUBJECT_MAX + 1) }).subject).toMatch(/under 150/);
    expect(newsletterProblems({ ...ok, body: "x".repeat(BODY_MAX + 1) }).body).toBe("The newsletter is too long to send.");
  });

  it("refuses a body that is not valid rich text, saying why", () => {
    expect(newsletterProblems({ ...ok, body: "[link](javascript:alert(1))" }).body).toMatch(/^The text has a formatting problem: /);
  });
});

describe("renderNewsletterBody", () => {
  it("renders paragraphs, lists and every mark with inline styles", () => {
    const html = renderNewsletterBody("One **bold** *it* ==wavy==\n\n- first\n- [second](https://example.org/a?b=1&c=2)", SITE);
    expect(html).toContain('<p style="margin:0 0 16px;">One <strong>bold</strong> <em>it</em> <span style="text-decoration:underline;text-decoration-style:wavy;');
    expect(html).toContain('<ul style="margin:0 0 16px;padding-left:24px;"><li style="margin:0 0 8px;">first</li>');
    expect(html).toContain('<a href="https://example.org/a?b=1&amp;c=2" style="color:#9b1c1f;text-decoration:underline;">second</a>');
  });

  it("makes site links absolute and leaves mailto links alone", () => {
    const html = renderNewsletterBody("[apply](/field-building) or [email](mailto:info@example.org)", SITE);
    expect(html).toContain(`href="${SITE}/field-building"`);
    expect(html).toContain('href="mailto:info@example.org"');
  });

  it("escapes text, so nothing typed becomes HTML", () => {
    expect(renderNewsletterBody(`Tom & Jerry say "hi" 'there' 2 > 1`, SITE)).toContain(
      "Tom &amp; Jerry say &quot;hi&quot; &#39;there&#39; 2 &gt; 1",
    );
  });
});

describe("renderNewsletterHtml", () => {
  it("is a whole branded email with the subject, a hidden preheader and the unsubscribe link", () => {
    const html = renderNewsletterHtml(ok, { siteUrl: SITE, unsubscribeHref: BREVO_UNSUBSCRIBE_TAG });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("<title>November update</title>");
    expect(html).toContain('<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">What we did</div>');
    expect(html).toContain(`<img src="${SITE}/logo-email.png" alt="Law for AI Safety"`);
    expect(html).toContain(">November update</h1>");
    expect(html).toContain("Hello <strong>all</strong>.");
    expect(html).toContain('<a href="{{ unsubscribe }}" style="color:#1b334c;">Unsubscribe</a>');
    expect(html).toContain(">lawforaisafety.test</a>");
  });

  it("escapes the subject and preview text", () => {
    const html = renderNewsletterHtml({ ...ok, subject: "<b>Hi</b>", previewText: "a & b" }, { siteUrl: SITE, unsubscribeHref: "#" });
    expect(html).toContain("<title>&lt;b&gt;Hi&lt;/b&gt;</title>");
    expect(html).toContain(">a &amp; b</div>");
  });

  it("renders an empty body as nothing, and an unreadable one as a notice, so the preview never breaks", () => {
    expect(renderNewsletterHtml({ ...ok, body: "" }, { siteUrl: SITE, unsubscribeHref: "#" })).not.toContain("<p style=\"margin:0 0 16px;\">");
    expect(renderNewsletterHtml({ ...ok, body: "**open" }, { siteUrl: SITE, unsubscribeHref: "#" })).toContain(
      "The text has a formatting problem; see the editor.",
    );
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML-special characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
