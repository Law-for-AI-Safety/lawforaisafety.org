"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const AUTO_DISMISS_MS = 10000;

export default function ApplyToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // "1": application is with reviewers. "confirm": email-only path, parked
  // until the applicant uses the link we just emailed them.
  const appliedParam = searchParams.get("applied");
  const applied = appliedParam === "1" || appliedParam === "confirm";
  const [visible, setVisible] = useState(applied);
  const [message] = useState(
    appliedParam === "confirm"
      ? "Almost done. Check your email and use the link we sent to submit your application."
      : "We'll review your application and be in touch.",
  );

  useEffect(() => {
    if (!applied) return;

    // Strip the query param so a refresh doesn't re-show the toast.
    router.replace("/#contact", { scroll: false });

    const timer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-6 z-50 mx-auto flex max-w-md items-start justify-between gap-4 rounded-sm border border-brand-navy bg-brand-black px-5 py-4 text-lg text-brand-white shadow-lg sm:inset-x-auto sm:right-6"
    >
      <p>{message}</p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="text-brand-white/60 hover:text-brand-white"
      >
        ✕
      </button>
    </div>
  );
}
