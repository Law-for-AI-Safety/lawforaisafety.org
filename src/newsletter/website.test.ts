import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { formatIssueDate } from "./dates";
import { isOnWebsite, issuePath, issueSlug, issueSummary, NEWSLETTER_PATH, RESERVED_ISSUE_SLUGS, websiteBody, type WebsiteRow } from "./website";

const SENT: WebsiteRow = {
  state: "submitted",
  webPublished: true,
  webSlug: "november-update",
  sentAt: new Date("2026-11-10T09:00:00Z"),
};

describe("whether an issue is on the website", () => {
  it("is once ticked, given an address and sent by Brevo's word, also while a change to it is checked", () => {
    expect(isOnWebsite(SENT)).toBe(true);
    expect(isOnWebsite({ ...SENT, state: "submitting" })).toBe(true);
  });

  it("is not while unticked, a draft, without an address, or not yet heard to be sent", () => {
    expect(isOnWebsite({ ...SENT, webPublished: false })).toBe(false);
    expect(isOnWebsite({ ...SENT, state: "draft" })).toBe(false);
    expect(isOnWebsite({ ...SENT, webSlug: null })).toBe(false);
    expect(isOnWebsite({ ...SENT, sentAt: null })).toBe(false);
  });
});

describe("an issue's address", () => {
  it("is made from its subject under /newsletter", () => {
    expect(issueSlug("November update: a new Fellowship!", new Set())).toBe("november-update-a-new-fellowship");
    expect(issuePath("november-update")).toBe("/newsletter/november-update");
    expect(NEWSLETTER_PATH).toBe("/newsletter");
  });

  it("is never a page of the sign-up flow", () => {
    expect(issueSlug("Confirm", new Set())).toBe("confirm-2");
    expect(issueSlug("Confirmed!", new Set())).toBe("confirmed-2");
    expect(issueSlug("Invalid", new Set(["invalid-2"]))).toBe("invalid-3");
  });

  it("keeps clear of every page under /newsletter, as the reserved list must name them all", () => {
    const pages = fs
      .readdirSync("src/app/newsletter", { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("["))
      .map((entry) => entry.name)
      .sort();
    expect([...RESERVED_ISSUE_SLUGS].sort()).toEqual(pages);
  });

  it("is numbered when taken, and has a fallback for a subject with no letters", () => {
    expect(issueSlug("Update", new Set(["update", "update-2"]))).toBe("update-3");
    expect(issueSlug("🎉 !!", new Set())).toBe("issue");
  });
});

describe("an issue's body on the website", () => {
  it("is the email's, unchanged when it has no merge tags", () => {
    const body = "Hello **everyone**.\n\n- [Apply](/field-building)";
    expect(websiteBody(body)).toBe(body);
  });

  it("leaves out Brevo's merge tags, which have no subscriber to fill them in", () => {
    expect(websiteBody("Hi {{ contact.FIRSTNAME }}, welcome.\n\nMore **news**.")).toBe("Hi, welcome.\n\nMore **news**.");
    expect(websiteBody("{{ contact.FIRSTNAME }}, hello.")).toBe(", hello.");
    expect(websiteBody("**Dear {{contact.NAME}}**\n\n{{ params.X }}\n\n- {{ a }}\n- Point\n\n- {{ b }}")).toBe("**Dear**\n\n- Point");
  });

  it("is left as it is when it can't be read", () => {
    expect(websiteBody("**{{ x }}")).toBe("**{{ x }}");
  });
});

describe("an issue's summary", () => {
  it("is the preview text when there is one", () => {
    expect(issueSummary("  What we did  ", "Body.")).toBe("What we did");
  });

  it("is otherwise the start of the body as plain text", () => {
    expect(issueSummary("", "Hello **everyone**, see [this](/field-building).\n\nMore.")).toBe("Hello everyone, see this.");
    expect(issueSummary("", "- First *point*\n- Second")).toBe("First point");
  });

  it("is cut at a word when the body is long", () => {
    const summary = issueSummary("", `${"word ".repeat(60)}end`);
    expect(summary.length).toBeLessThanOrEqual(201);
    expect(summary).toMatch(/word…$/);
    expect(issueSummary("", "x".repeat(300))).toBe(`${"x".repeat(200)}…`);
  });

  it("is empty for a body with nothing to show or that can't be read", () => {
    expect(issueSummary("", "")).toBe("");
    expect(issueSummary("", "**unclosed")).toBe("");
  });
});

describe("an issue's date", () => {
  it("is shown in UK time", () => {
    expect(formatIssueDate("2026-11-10T09:00:00.000Z")).toBe("10 November 2026");
    // Just after midnight in London during summer time, still the previous day in UTC.
    expect(formatIssueDate("2026-07-01T23:30:00.000Z")).toBe("2 July 2026");
  });
});
