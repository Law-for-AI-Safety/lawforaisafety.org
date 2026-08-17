"use client";

import { useState } from "react";
import {
  FORM_RENDERED_AT_FIELD_NAME,
  HONEYPOT_FIELD_NAME,
} from "@/lib/abuse-protection";
import WipeSubmitButton from "../WipeSubmitButton";
import TurnstileWidget from "./TurnstileWidget";
import { FIELD_CLASSES } from "./field-styles";

export default function NewsletterForm() {
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [renderedAt] = useState(() => Date.now());

  if (status === "done") {
    return (
      <p className="text-lg text-brand-navy">
        Thanks. Check your inbox to confirm your subscription.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setStatus("submitting");
        setError(null);
        const formData = new FormData(event.currentTarget);
        try {
          const res = await fetch("/api/newsletter", { method: "POST", body: formData });
          if (!res.ok) {
            setStatus("idle");
            const body = await res.json().catch(() => null);
            setError(
              body?.error === "Verification failed"
                ? "We couldn't verify you're not a robot. Please try again."
                : "Something went wrong. Please try again.",
            );
            return;
          }
        } catch {
          setStatus("idle");
          setError("Something went wrong. Please try again.");
          return;
        }
        setStatus("done");
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
      >
        <label>
          Website
          <input type="text" name={HONEYPOT_FIELD_NAME} tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <input type="hidden" name={FORM_RENDERED_AT_FIELD_NAME} value={renderedAt} readOnly />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <input
          type="email"
          name="email"
          required
          placeholder="you@example.com"
          className={`flex-1 text-brand-black ${FIELD_CLASSES}`}
        />
        <WipeSubmitButton
          type="submit"
          disabled={status === "submitting"}
          className="bg-brand-navy px-6 py-3 text-lg text-brand-white text-center rounded-sm overflow-hidden disabled:opacity-60"
          hoverBg="rgba(255,255,255,0.15)"
        >
          {status === "submitting" ? "Subscribing…" : "Subscribe"}
        </WipeSubmitButton>
      </div>

      <TurnstileWidget />

      {error && <p className="text-lg text-brand-red">{error}</p>}
    </form>
  );
}
