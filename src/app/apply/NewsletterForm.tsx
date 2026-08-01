"use client";

import { useState } from "react";
import {
  FORM_RENDERED_AT_FIELD_NAME,
  HONEYPOT_FIELD_NAME,
} from "@/lib/abuse-protection";
import WipeSubmitButton from "../WipeSubmitButton";
import { FIELD_CLASSES } from "./field-styles";

export default function NewsletterForm() {
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
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
      className="flex flex-col gap-3 sm:flex-row sm:items-start"
      onSubmit={async (event) => {
        event.preventDefault();
        setStatus("submitting");
        const formData = new FormData(event.currentTarget);
        try {
          await fetch("/api/newsletter", { method: "POST", body: formData });
        } finally {
          setStatus("done");
        }
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
    </form>
  );
}
