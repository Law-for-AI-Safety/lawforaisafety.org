"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { EndSessionsResult } from "./session-actions";

/** Logs one person out on every device, after a confirmation. */
export default function EndSessionsButton({
  email,
  name,
  isYou,
  endSessions,
}: {
  email: string;
  name: string;
  /** Whether this is the person pressing it, who is then logged out too. */
  isYou: boolean;
  endSessions: (email: string) => Promise<EndSessionsResult>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const end = () => {
    const question = isYou
      ? "End all your sessions, including this one? You will be logged out everywhere."
      : `Log ${name} out on every device? They can sign in again unless they are also removed from ADMIN_EMAILS.`;
    if (!window.confirm(question)) return;
    setError(null);
    startTransition(async () => {
      const result = await endSessions(email);
      if (!result.ok) setError(result.message);
      else if (isYou) router.push("/admin/login");
      // The person drops off the list.
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={end}
        disabled={pending}
        className="rounded-sm border border-brand-red px-3 py-1 text-sm text-brand-red disabled:opacity-50"
      >
        {isYou ? "End my sessions" : "End sessions"}
      </button>
      {error && (
        <span role="alert" className="text-sm text-brand-red">
          {error}
        </span>
      )}
    </div>
  );
}
