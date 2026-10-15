import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FORM_RENDERED_AT_FIELD_NAME,
  HONEYPOT_FIELD_NAME,
  looksLikeBot,
} from "@/lib/abuse-protection";

const NOW = new Date("2026-10-15T12:00:00Z").getTime();

function submission(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}

/** A form rendered `msAgo` before it is submitted. */
function renderedAgo(msAgo: number, extra: Record<string, string> = {}): FormData {
  return submission({ [FORM_RENDERED_AT_FIELD_NAME]: String(NOW - msAgo), ...extra });
}

describe("looksLikeBot", () => {
  // Only Date is faked: the check reads the clock, and nothing here waits on a timer.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  });

  it("passes a form filled in at human speed with an empty honeypot", () => {
    expect(looksLikeBot(renderedAgo(10_000, { [HONEYPOT_FIELD_NAME]: "" }))).toBe(false);
  });

  it("passes a form submitted exactly at the minimum fill time", () => {
    expect(looksLikeBot(renderedAgo(2000))).toBe(false);
  });

  it("flags a form submitted faster than a human could fill it in", () => {
    expect(looksLikeBot(renderedAgo(1999))).toBe(true);
  });

  it("flags a filled-in honeypot however slowly the form was filled", () => {
    expect(looksLikeBot(renderedAgo(60_000, { [HONEYPOT_FIELD_NAME]: "https://spam" }))).toBe(
      true,
    );
  });

  it("ignores a honeypot holding only whitespace", () => {
    expect(looksLikeBot(renderedAgo(10_000, { [HONEYPOT_FIELD_NAME]: "  " }))).toBe(false);
  });

  it("flags a submission with no timestamp", () => {
    expect(looksLikeBot(submission({ email: "a@example.com" }))).toBe(true);
  });

  it("flags a timestamp that is not a number", () => {
    expect(looksLikeBot(submission({ [FORM_RENDERED_AT_FIELD_NAME]: "yesterday" }))).toBe(true);
  });

  it("flags a timestamp sent as a file", () => {
    const form = new FormData();
    form.set(FORM_RENDERED_AT_FIELD_NAME, new Blob([String(NOW - 10_000)]));
    expect(looksLikeBot(form)).toBe(true);
  });
});

