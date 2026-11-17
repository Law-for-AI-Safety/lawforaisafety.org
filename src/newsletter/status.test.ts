import { describe, expect, it } from "vitest";
import type { Campaign } from "../lib/brevo-campaigns";
import { newsletterStatus, type StatusRow } from "./status";

const NOW = new Date("2026-11-15T12:00:00Z");
const STUCK = 5 * 60_000;
const row = (over: Partial<StatusRow> = {}): StatusRow => ({
  state: "submitted",
  version: 3,
  testedVersion: 3,
  scheduledAt: new Date("2026-11-20T09:00:00Z"),
  submittedAt: new Date("2026-11-15T11:00:00Z"),
  ...over,
});
const campaign = (over: Partial<Campaign>): Campaign => ({ id: 1, status: "queued", scheduledAt: null, sentAt: null, delivered: null, ...over });

describe("newsletterStatus", () => {
  it("shows a draft, and whether this version was tested", () => {
    expect(newsletterStatus(row({ state: "draft" }), null, NOW, STUCK)).toEqual({ kind: "draft", tested: true });
    expect(newsletterStatus(row({ state: "draft", testedVersion: 2 }), null, NOW, STUCK)).toEqual({ kind: "draft", tested: false });
  });

  it("shows a hand-over in progress, and one interrupted", () => {
    expect(newsletterStatus(row({ state: "submitting", submittedAt: new Date(NOW.getTime() - 60_000) }), null, NOW, STUCK)).toEqual({ kind: "submitting", stuck: false });
    expect(newsletterStatus(row({ state: "submitting", submittedAt: new Date(NOW.getTime() - STUCK) }), null, NOW, STUCK)).toEqual({ kind: "submitting", stuck: true });
    expect(newsletterStatus(row({ state: "submitting", submittedAt: null }), null, NOW, STUCK)).toEqual({ kind: "submitting", stuck: true });
  });

  it("takes Brevo's word once Brevo has it", () => {
    const at = new Date("2026-11-21T09:00:00Z");
    expect(newsletterStatus(row(), campaign({ scheduledAt: at }), NOW, STUCK)).toEqual({ kind: "scheduled", at });
    expect(newsletterStatus(row(), campaign({}), NOW, STUCK)).toEqual({ kind: "scheduled", at: row().scheduledAt });
    expect(newsletterStatus(row({ scheduledAt: null }), campaign({}), NOW, STUCK)).toEqual({ kind: "scheduled", at: NOW });
    expect(newsletterStatus(row(), campaign({ status: "in_process" }), NOW, STUCK)).toEqual({ kind: "sending" });
    expect(newsletterStatus(row(), campaign({ status: "in_review" }), NOW, STUCK)).toEqual({ kind: "sending" });
    expect(newsletterStatus(row(), campaign({ status: "sent", sentAt: at, delivered: 118 }), NOW, STUCK)).toEqual({ kind: "sent", at, delivered: 118 });
    expect(newsletterStatus(row(), campaign({ status: "suspended" }), NOW, STUCK)).toEqual({ kind: "stopped", brevoStatus: "suspended" });
  });

  it("says when Brevo has no such campaign or could not be asked", () => {
    expect(newsletterStatus(row(), null, NOW, STUCK)).toEqual({ kind: "stopped", brevoStatus: "deleted" });
    expect(newsletterStatus(row(), undefined, NOW, STUCK)).toEqual({ kind: "unknown" });
  });
});
