import type { NewsletterStatus } from "@/newsletter/status";
import LocalTime from "./LocalTime";

const TONE = {
  quiet: "border-brand-black/30 text-brand-black/80",
  active: "border-brand-navy bg-brand-navy text-brand-white",
  warn: "border-brand-red text-brand-red",
};

/** A newsletter's status in a few words, with its time where it has one. */
export default function StatusBadge({ status }: { status: NewsletterStatus }) {
  const [label, tone]: [React.ReactNode, keyof typeof TONE] = (() => {
    switch (status.kind) {
      case "draft":
        return [status.tested ? "Draft · test sent" : "Draft", "quiet"];
      case "submitting":
        return [status.stuck ? "Hand-over to Brevo interrupted" : "Being handed to Brevo", "warn"];
      case "scheduled":
        return [
          <>
            Scheduled for <LocalTime iso={status.at.toISOString()} />
          </>,
          "active",
        ];
      case "sending":
        return ["Sending now", "active"];
      case "sent":
        return [
          <>
            Sent{status.at && <> <LocalTime iso={status.at.toISOString()} /></>}
            {status.delivered !== null && ` · delivered to ${status.delivered}`}
          </>,
          "quiet",
        ];
      case "stopped":
        return [`Stopped in Brevo (${status.brevoStatus})`, "warn"];
      case "unknown":
        return ["Could not reach Brevo to check", "warn"];
    }
  })();
  return <span className={`inline-block rounded-sm border px-2 py-0.5 text-sm ${TONE[tone]}`}>{label}</span>;
}
