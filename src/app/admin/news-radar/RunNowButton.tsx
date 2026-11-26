"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runNow } from "./actions";

/** For technical admins, to test the radar: runs it now, without sending the weekly email. */
export default function RunNowButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await runNow();
            if (!result.ok) setMessage({ text: result.message, error: true });
            else {
              setMessage({
                text: `Done: ${result.newCount} new, ${result.seenCount} seen before${result.failed > 0 ? `, ${result.failed} ${result.failed === 1 ? "source" : "sources"} failed` : ""}. No email is sent for a run by hand.`,
                error: false,
              });
              router.refresh();
            }
          })
        }
        className="self-start rounded-sm border border-brand-navy px-4 py-2 text-brand-navy disabled:opacity-60"
      >
        {pending ? "Running… (up to half a minute)" : "Run now"}
      </button>
      {message && (
        <p role={message.error ? "alert" : "status"} className={`text-sm ${message.error ? "text-brand-red" : "text-brand-black/70"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
