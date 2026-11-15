"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createNewsletter } from "./actions";

export default function NewNewsletterButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await createNewsletter();
            if (result.ok) router.push(`/admin/newsletters/${result.id}`);
            else setError(result.message);
          })
        }
        className="self-start rounded-sm bg-brand-navy px-4 py-2 text-brand-white disabled:opacity-60"
      >
        {pending ? "Creating…" : "Write a newsletter"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-brand-red">
          {error}
        </p>
      )}
    </div>
  );
}
