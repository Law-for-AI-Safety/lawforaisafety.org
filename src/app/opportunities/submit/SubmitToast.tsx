"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const AUTO_DISMISS_MS = 10000;

export default function SubmitToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // "1": the submission is with the team. "confirm": email path, waiting on the emailed link.
  const submittedParam = searchParams.get("submitted");
  const submitted = submittedParam === "1" || submittedParam === "confirm";
  const [visible, setVisible] = useState(submitted);
  const [message] = useState(
    submittedParam === "confirm"
      ? "Almost done. Check your email and use the link we sent to send us the opportunity."
      : "Thanks, we've got it. We'll review it and email you if it goes on the board.",
  );

  useEffect(() => {
    if (!submitted) return;

    // Strip the query param so a refresh doesn't re-show the toast.
    router.replace("/opportunities/submit", { scroll: false });

    const timer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);

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
