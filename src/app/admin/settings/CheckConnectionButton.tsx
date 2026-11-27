"use client";

import { useState, useTransition } from "react";
import type { CheckConnectionResult } from "./publishing-actions";

/** Runs a read-only call to GitHub as the App and says whether it worked, and if not, why. */
export default function CheckConnectionButton({ check }: { check: () => Promise<CheckConnectionResult> }) {
  const [result, setResult] = useState<CheckConnectionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    setResult(null);
    startTransition(async () => setResult(await check()));
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-sm border border-brand-navy px-3 py-1 text-sm text-brand-navy disabled:opacity-50"
      >
        {pending ? "Checking…" : "Check connection"}
      </button>
      {result &&
        (result.ok ? (
          <p role="status" className="text-sm text-brand-navy">
            {result.message}
          </p>
        ) : (
          <p role="alert" className="break-words text-sm text-brand-red">
            {result.setup ? "Setup problem: " : "Failed: "}
            {result.message}
          </p>
        ))}
    </div>
  );
}
