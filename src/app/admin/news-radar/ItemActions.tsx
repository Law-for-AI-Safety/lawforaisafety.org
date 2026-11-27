"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ItemState } from "@/lib/news-radar-store";
import { triageItem } from "./actions";

/**
 * An item's triage buttons, which also triage the other outlets' copies of its story (`copyIds`).
 * Items go into the subscriber newsletter from its composer ("Insert from News radar").
 */
export default function ItemActions({ itemId, copyIds = [], state }: { itemId: string; copyIds?: string[]; state: ItemState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  const triage = (next: ItemState) =>
    startTransition(async () => {
      const result = await triageItem(itemId, next, copyIds);
      if (result.ok) {
        setProblem(null);
        router.refresh();
      } else setProblem(result.message);
    });

  const button = "rounded-sm border px-3 py-1 text-sm disabled:opacity-60";
  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {state !== "useful" && (
          <button type="button" disabled={pending} onClick={() => triage("useful")} className={`${button} border-brand-navy text-brand-navy`}>
            Useful
          </button>
        )}
        {state !== "dismissed" && (
          <button type="button" disabled={pending} onClick={() => triage("dismissed")} className={`${button} border-brand-black/30 text-brand-black/80`}>
            Dismiss
          </button>
        )}
        {state !== "new" && (
          <button type="button" disabled={pending} onClick={() => triage("new")} className={`${button} border-brand-black/30 text-brand-black/80`}>
            Back to new
          </button>
        )}
      </div>
      {problem && (
        <p role="alert" className="text-sm text-brand-red">
          {problem}
        </p>
      )}
    </div>
  );
}
