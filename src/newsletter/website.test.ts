import { describe, expect, it } from "vitest";
import { formatIssueDate } from "./dates";
import { isBoundForWebsite, isOnWebsite, issuePath, issueSlug, issueSummary, sentDate, UPDATES_PATH, type WebsiteRow } from "./website";

const NOW = new Date("2026-11-15T12:00:00Z");
const SENT: WebsiteRow = {
  state: "submitted",
  webPublished: true,
  webSlug: "november-update",
  scheduledAt: new Date("2026-11-10T09:00:00Z"),
  sentAt: null,
};

describe("whether an issue is on the website", () => {
  it("is once ticked, handed to Brevo, given an address and past its send time", () => {
    expect(isOnWebsite(SENT, NOW)).toBe(true);
    expect(isOnWebsite({ ...SENT, scheduledAt: NOW }, NOW)).toBe(true);
  });

  it("is not while unticked, a draft, mid-change, without an address or before its send time", () => {
    expect(isOnWebsite({ ...SENT, webPublished: false }, NOW)).toBe(false);
    expect(isOnWebsite({ ...SENT, state: "draft" }, NOW)).toBe(false);
    expect(isOnWebsite({ ...SENT, state: "submitting" }, NOW)).toBe(false);
    expect(isOnWebsite({ ...SENT, webSlug: null }, NOW)).toBe(false);
    expect(isOnWebsite({ ...SENT, scheduledAt: null }, NOW)).toBe(false);
    expect(isOnWebsite({ ...SENT, scheduledAt: new Date("2026-11-15T12:00:01Z") }, NOW)).toBe(false);
  });

  it("counts a scheduled issue as bound for the website before its send time", () => {
    const later = { ...SENT, scheduledAt: new Date("2026-12-01T09:00:00Z") };
    expect(isBoundForWebsite(later)).toBe(true);
    expect(isOnWebsite(later, NOW)).toBe(false);
  });

  it("dates an issue by when Brevo said it went, else by when it was given", () => {
    expect(sentDate(SENT)).toEqual(SENT.scheduledAt);
    const brevoSaid = new Date("2026-11-10T09:02:00Z");
    expect(sentDate({ ...SENT, sentAt: brevoSaid })).toEqual(brevoSaid);
    expect(isOnWebsite({ ...SENT, scheduledAt: null, sentAt: brevoSaid }, NOW)).toBe(true);
  });
});

describe("an issue's address", () => {
  it("is made from its subject under /updates", () => {
    expect(issueSlug("November update: a new Fellowship!", new Set())).toBe("november-update-a-new-fellowship");
    expect(issuePath("november-update")).toBe("/updates/november-update");
    expect(UPDATES_PATH).toBe("/updates");
  });

  it("is numbered when taken, and has a fallback for a subject with no letters", () => {
    expect(issueSlug("Update", new Set(["update", "update-2"]))).toBe("update-3");
    expect(issueSlug("🎉 !!", new Set())).toBe("update");
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
