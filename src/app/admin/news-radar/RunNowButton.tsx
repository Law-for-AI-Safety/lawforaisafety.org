"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runNow } from "./actions";

/** How often the page checks on a run that is still going. */
export const REFRESH_MS = 15_000;

/**
 * For technical admins, to test the radar: "Run now" runs it without the weekly email; "Run and
 * send digest" also emails the summary to the recipient, after asking. A run can take minutes,
 * so the page reloads its status line until the run finishes.
 */
export default function RunNowButton({ running, recipient, production }: { running: boolean; recipient: string | null; production: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [running, router]);

  const start = (sendDigest: boolean) => {
    if (sendDigest) {
      const where = production ? "" : " This is not the production site, so the email will not actually be sent.";
      if (!window.confirm(`Run the radar now and email the summary to ${recipient}?${where}`)) return;
    }
    startTransition(async () => {
      const result = await runNow(sendDigest);
      if (!result.ok) setMessage({ text: result.message, error: true });
      else {
        const text = result.finished
          ? sendDigest
            ? "Done: the result is above, with what became of the email."
            : "Done: the result is above. No email is sent."
          : `Started: the result appears above when it finishes, usually within a few minutes.${sendDigest ? ` It then emails the summary to ${recipient}.` : " No email is sent."}`;
        setMessage({ text, error: false });
      }
      router.refresh();
    });
  };

  const button = "rounded-sm border border-brand-navy px-4 py-2 text-brand-navy disabled:opacity-60";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending || running} aria-busy={pending} onClick={() => start(false)} className={button}>
          {pending ? "Starting…" : "Run now"}
        </button>
        <button type="button" disabled={pending || running || !recipient} onClick={() => start(true)} className={button}>
          Run and send digest
        </button>
      </div>
      {!recipient && <p className="text-sm text-brand-black/60">Set a recipient in the settings to send the digest.</p>}
      {message && (
        <p role={message.error ? "alert" : "status"} className={`text-sm ${message.error ? "text-brand-red" : "text-brand-black/70"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
