"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatLocalInput, scheduleProblem } from "@/newsletter/schedule";
import type { NewsletterStatus } from "@/newsletter/status";
import { cancelNewsletter, recoverNewsletter, rescheduleNewsletter } from "../actions";
import ConfirmSend from "../ConfirmSend";
import { useTimeZone } from "../LocalTime";
import WhenPicker, { whenFromInput } from "../WhenPicker";

/** What can still be done with a newsletter Brevo has: reschedule or cancel it before it goes, or settle an interrupted hand-over. */
export default function SubmittedControls({
  id,
  subject,
  status,
  stuck,
  scheduledAt,
}: {
  id: string;
  subject: string;
  status: NewsletterStatus["kind"];
  stuck: boolean;
  scheduledAt: string | null;
}) {
  const router = useRouter();
  const timeZone = useTimeZone();
  const [step, setStep] = useState<"idle" | "pick" | "confirm" | "cancel">("idle");
  const [when, setWhen] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: true } | { ok: false; message: string }>) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setStep("idle");
        router.refresh();
      } else setError(result.message);
    });

  if (status === "submitting") {
    return stuck ? (
      <div className="flex flex-col gap-2">
        <p className="text-brand-black">
          Handing this newsletter to Brevo was interrupted. Check with Brevo to find out whether it was scheduled, and to
          make it editable again if not.
        </p>
        <button type="button" disabled={pending} onClick={() => run(() => recoverNewsletter(id))} className="self-start rounded-sm bg-brand-navy px-4 py-2 text-brand-white disabled:opacity-40">
          Check with Brevo
        </button>
        {error && <p role="alert" className="text-brand-red">{error}</p>}
      </div>
    ) : (
      <p className="text-brand-black/70">This newsletter is being handed to Brevo. Reload in a moment.</p>
    );
  }

  if (status !== "scheduled") return null;

  const at = whenFromInput(when);
  const timeProblem = at ? scheduleProblem(at, new Date()) : "Choose a date and time.";

  return (
    <div className="flex flex-col gap-3">
      {step === "idle" && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setWhen(scheduledAt ? formatLocalInput(new Date(scheduledAt), timeZone) : "");
              setError(null);
              setStep("pick");
            }}
            className="rounded-sm border border-brand-navy px-4 py-2 text-brand-navy"
          >
            Reschedule
          </button>
          <button type="button" onClick={() => { setError(null); setStep("cancel"); }} className="rounded-sm border border-brand-red px-4 py-2 text-brand-red">
            Cancel sending
          </button>
        </div>
      )}
      {step === "pick" && (
        <div className="flex flex-col gap-2">
          <WhenPicker label="New send time" value={when} onChange={setWhen} />
          {timeProblem && <p className="text-sm text-brand-black/70">{timeProblem}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={!!timeProblem} onClick={() => setStep("confirm")} className="rounded-sm border-2 border-brand-red px-4 py-2 text-brand-red disabled:opacity-40">
              Reschedule…
            </button>
            <button type="button" onClick={() => setStep("idle")} className="rounded-sm border border-brand-black/30 px-4 py-2">
              Go back
            </button>
          </div>
        </div>
      )}
      {step === "confirm" && at && (
        <ConfirmSend
          subject={subject}
          at={at}
          action="Reschedule"
          onClose={() => setStep("pick")}
          onConfirm={async (count) => {
            const result = await rescheduleNewsletter(id, at.toISOString(), count);
            if (result.ok) {
              setStep("idle");
              router.refresh();
            }
            return result;
          }}
        />
      )}
      {step === "cancel" && (
        <section role="dialog" aria-modal="false" aria-label="Cancel sending" className="flex flex-col gap-3 rounded-sm border-2 border-brand-red p-4">
          <p className="text-brand-black">
            Cancel the scheduled send? Nothing goes out, and the newsletter becomes an editable draft again.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={pending} onClick={() => run(() => cancelNewsletter(id))} className="rounded-sm bg-brand-red px-4 py-2 text-brand-white disabled:opacity-40">
              {pending ? "Cancelling…" : "Cancel sending"}
            </button>
            <button type="button" disabled={pending} onClick={() => setStep("idle")} className="rounded-sm border border-brand-black/30 px-4 py-2">
              Keep it scheduled
            </button>
          </div>
        </section>
      )}
      {error && <p role="alert" className="text-brand-red">{error}</p>}
    </div>
  );
}
