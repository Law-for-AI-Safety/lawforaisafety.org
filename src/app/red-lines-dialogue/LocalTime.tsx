"use client";

import { useEffect, useState } from "react";

/**
 * Appends "(HH:MM)" next to a published CET/CEST meeting time,
 * computed from the visitor's own timezone. Rendered empty on the server and
 * on first client render (so there's nothing to mismatch during hydration),
 * then filled in from an effect once the browser's timezone is available.
 */
export default function LocalTime({ utc }: { utc: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    async function computeLocalTime() {
      try {
        const formatted = new Intl.DateTimeFormat(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        }).format(new Date(utc));
        setText(formatted);
      } catch {
        // Unsupported Intl options in this browser: the published CET/CEST
        // time on its own is still correct, just not localised.
      }
    }
    computeLocalTime();
  }, [utc]);

  if (!text) return null;
  return <span className="text-brand-navy/60"> ({text})</span>;
}
