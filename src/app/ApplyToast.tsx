"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const AUTO_DISMISS_MS = 6000;

export default function ApplyToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const applied = searchParams.get("applied") === "1";
  const [visible, setVisible] = useState(applied);

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
      <p>We&apos;ll review your application and be in touch.</p>
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
