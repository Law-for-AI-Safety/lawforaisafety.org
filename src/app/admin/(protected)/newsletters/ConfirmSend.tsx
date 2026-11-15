"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { describeTime } from "@/newsletter/schedule";
import { getSendList, type ListSummary, type Refusal } from "./actions";
import { useTimeZone } from "./LocalTime";

/**
 * The last step before a newsletter goes to the list. It names the list and its live
 * subscriber count, says when it will go, and only lets the send through once that count is
 * typed back. The server checks the typed count against a fresh one.
 */
export default function ConfirmSend({
  subject,
  at,
  action,
  onConfirm,
  onClose,
}: {
  subject: string;
  /** The send time, or null to send at once. */
  at: Date | null;
  /** What the button does, e.g. "Schedule" or "Reschedule". */
  action: string;
  onConfirm: (typedCount: number) => Promise<{ ok: true } | Refusal>;
  onClose: () => void;
}) {
  const timeZone = useTimeZone();
  const inputId = useId();
  const [list, setList] = useState<ListSummary | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    getSendList().then((result) => {
      if (live) setList(result);
    });
    return () => {
      live = false;
    };
  }, []);

  const when = at ? describeTime(at, timeZone) : null;
  const matches = list?.ok === true && typed.trim() === String(list.subscribers);
  const verb = at ? action : "Send now";

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${inputId}-title`}
      className="flex flex-col gap-4 rounded-sm border-2 border-brand-red bg-brand-white p-4"
    >
      <h2 id={`${inputId}-title`} className="font-sans text-xl text-brand-black">
        {at ? `${action} this newsletter for the whole list?` : "Send this newsletter to the whole list now?"}
      </h2>
      {list === null ? (
        <p className="text-brand-black/70">Checking the list with Brevo…</p>
      ) : !list.ok ? (
        <p role="alert" className="text-brand-red">
          {list.message}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
            <dt className="text-brand-black/70">Subject</dt>
            <dd className="text-brand-black">{subject}</dd>
            <dt className="text-brand-black/70">List</dt>
            <dd className="text-brand-black">{list.name}</dd>
            <dt className="text-brand-black/70">Subscribers</dt>
            <dd className="text-brand-black">{list.subscribers}</dd>
            <dt className="text-brand-black/70">Goes out</dt>
            <dd className="text-brand-black">{when ?? "Straight away"}</dd>
          </dl>
          <p className="text-brand-black">
            Once it has gone out it can&apos;t be recalled.{" "}
            {at ? "Until then you can cancel or reschedule it here." : "Sending now cannot be cancelled."}
          </p>
          {!list.production && (
            <p role="status" className="text-brand-red">
              This isn&apos;t the live site, so the send will be refused. Sending to the list only works on lawforaisafety.org.
            </p>
          )}
          <label htmlFor={inputId} className="flex flex-col gap-1 text-brand-black">
            To confirm, type the number of subscribers ({list.subscribers})
            <input
              id={inputId}
              inputMode="numeric"
              autoComplete="off"
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                setError(null);
              }}
              className="w-40 rounded-sm border border-brand-black/30 px-2 py-1"
            />
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="text-brand-red">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!matches || pending}
          onClick={() =>
            startTransition(async () => {
              const result = await onConfirm(Number(typed.trim()));
              if (!result.ok) setError(result.message);
            })
          }
          className="rounded-sm bg-brand-red px-4 py-2 text-brand-white disabled:opacity-40"
        >
          {pending ? "Handing to Brevo…" : list?.ok ? `${verb}: ${list.subscribers} subscribers` : verb}
        </button>
        <button type="button" onClick={onClose} disabled={pending} className="rounded-sm border border-brand-black/30 px-4 py-2">
          Go back
        </button>
      </div>
    </section>
  );
}
