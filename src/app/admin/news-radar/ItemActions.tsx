"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ItemState } from "@/lib/news-radar-store";
import { addToNewsletter, triageItem } from "./actions";

const NEW_DRAFT = "new";

/**
 * An item's triage buttons, which also triage the other outlets' copies of its story (`copyIds`),
 * and "Add to newsletter", which appends its title and link to a draft. Until a draft is chosen
 * here, it targets the most recently changed one, so a draft that adding to another item just
 * made becomes every item's target once the page refreshes, and the items build one list.
 */
export default function ItemActions({
  itemId,
  copyIds = [],
  state,
  drafts,
}: {
  itemId: string;
  copyIds?: string[];
  state: ItemState;
  drafts: { id: string; subject: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);
  const target = chosen !== null && (chosen === NEW_DRAFT || drafts.some((d) => d.id === chosen)) ? chosen : (drafts[0]?.id ?? NEW_DRAFT);
  const setTarget = setChosen;
  const [message, setMessage] = useState<{ text: string; error: boolean; href?: string } | null>(null);

  const triage = (next: ItemState) =>
    startTransition(async () => {
      const result = await triageItem([itemId, ...copyIds], next);
      if (result.ok) {
        setMessage(null);
        router.refresh();
      } else setMessage({ text: result.message, error: true });
    });

  const add = () =>
    startTransition(async () => {
      const result = await addToNewsletter(itemId, target === NEW_DRAFT ? null : target);
      if (result.ok) {
        setMessage({ text: `Added to “${result.subject}”.`, error: false, href: `/admin/newsletters/${result.newsletterId}` });
        setTarget(null);
        router.refresh();
      } else setMessage({ text: result.message, error: true });
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
        <span className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`newsletter-${itemId}`}>
            Newsletter draft
          </label>
          <select
            id={`newsletter-${itemId}`}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={pending}
            className="max-w-48 rounded-sm border border-brand-black/30 bg-brand-white px-2 py-1 text-sm"
          >
            {drafts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.subject}
              </option>
            ))}
            <option value={NEW_DRAFT}>New draft</option>
          </select>
          <button type="button" disabled={pending} onClick={add} className={`${button} border-brand-navy text-brand-navy`}>
            Add to newsletter
          </button>
        </span>
      </div>
      {message && (
        <p role={message.error ? "alert" : "status"} className={`text-sm ${message.error ? "text-brand-red" : "text-brand-black/70"}`}>
          {message.text}{" "}
          {message.href && (
            <Link href={message.href} className="underline">
              Open the draft
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
