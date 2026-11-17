import type { Campaign } from "../lib/brevo-campaigns";

/**
 * Where a newsletter stands, from our row and Brevo's campaign. Once Brevo has it, Brevo's
 * status is the truth: our row only says it was handed over.
 */
export type NewsletterStatus =
  | { kind: "draft"; tested: boolean }
  | { kind: "submitting"; stuck: boolean }
  | { kind: "scheduled"; at: Date }
  | { kind: "sending" }
  | { kind: "sent"; at: Date | null; delivered: number | null }
  | { kind: "stopped"; brevoStatus: string }
  | { kind: "unknown" };

export type StatusRow = {
  state: "draft" | "submitting" | "submitted";
  version: number;
  testedVersion: number | null;
  scheduledAt: Date | null;
  submittedAt: Date | null;
};

/** `campaign` is undefined when Brevo could not be asked, and null when it has no such campaign. */
export function newsletterStatus(row: StatusRow, campaign: Campaign | null | undefined, now: Date, stuckAfterMs: number): NewsletterStatus {
  if (row.state === "draft") return { kind: "draft", tested: row.testedVersion === row.version };
  if (row.state === "submitting") {
    return { kind: "submitting", stuck: now.getTime() - (row.submittedAt?.getTime() ?? 0) >= stuckAfterMs };
  }
  if (campaign === undefined) return { kind: "unknown" };
  if (campaign === null) return { kind: "stopped", brevoStatus: "deleted" };
  switch (campaign.status) {
    case "queued":
      return { kind: "scheduled", at: campaign.scheduledAt ?? row.scheduledAt ?? now };
    case "in_process":
    case "in_review":
      return { kind: "sending" };
    case "sent":
      return { kind: "sent", at: campaign.sentAt, delivered: campaign.delivered };
    default:
      return { kind: "stopped", brevoStatus: campaign.status };
  }
}
