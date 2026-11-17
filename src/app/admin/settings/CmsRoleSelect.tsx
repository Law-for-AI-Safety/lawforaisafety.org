"use client";

import { useId, useState, useTransition } from "react";
import type { SetCmsRoleResult } from "./cms-actions";

type Choice = "none" | "draft" | "publish";

const LABELS: Record<Choice, string> = {
  none: "No access",
  draft: "Can edit drafts",
  publish: "Can edit and publish",
};

/** One person's website-editing permission, saved as soon as it is changed. */
export default function CmsRoleSelect({
  email,
  name,
  initial,
  setRole,
}: {
  email: string;
  name: string;
  initial: Choice;
  setRole: (email: string, permission: Choice) => Promise<SetCmsRoleResult>;
}) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        Website editing for {name}
      </label>
      <select
        id={id}
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as Choice;
          const previous = value;
          setValue(next);
          setMessage(null);
          startTransition(async () => {
            const result = await setRole(email, next);
            if (result.ok) {
              setMessage({ ok: true, text: "Saved" });
            } else {
              setValue(previous);
              setMessage({ ok: false, text: result.message });
            }
          });
        }}
        className="rounded-sm border border-brand-black/30 bg-brand-white px-2 py-1"
      >
        {(Object.keys(LABELS) as Choice[]).map((choice) => (
          <option key={choice} value={choice}>
            {LABELS[choice]}
          </option>
        ))}
      </select>
      {message && (
        <span role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-brand-navy" : "text-brand-red"}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}
