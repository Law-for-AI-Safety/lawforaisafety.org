"use client";

import { useId, useState } from "react";
import { HONEYPOT_FIELD_NAME } from "@/lib/abuse-protection";
import RenderedAtField, { useRenderedAt } from "./RenderedAtField";
import WipeSubmitButton from "../WipeSubmitButton";
import TurnstileWidget from "./TurnstileWidget";
import { FIELD_CLASSES } from "./field-styles";

/** Colours for each background the form sits on: the site's light bands, or the dark footer. */
const TONES = {
  light: { message: "text-brand-navy", error: "text-brand-red", button: "bg-brand-navy" },
  dark: { message: "text-brand-white", error: "text-brand-white border-l-4 border-brand-red pl-3", button: "bg-brand-red" },
};

/**
 * The newsletter sign-up: an email, posted to `/api/newsletter`, which sends a link to confirm.
 * `deferVerification` waits to load Cloudflare's check until the visitor starts on the form, for
 * a form on every page (the footer's) that most visitors never use.
 */
export default function NewsletterForm({
  tone = "light",
  deferVerification = false,
}: {
  tone?: keyof typeof TONES;
  deferVerification?: boolean;
} = {}) {
  const colours = TONES[tone];
  const [engaged, setEngaged] = useState(!deferVerification);
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const renderedAt = useRenderedAt();
  const emailId = useId();

  if (status === "done") {
    return (
      <p role="status" className={`text-lg ${colours.message}`}>
        Thanks. Check your inbox to confirm your subscription.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onFocus={() => setEngaged(true)}
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
      <RenderedAtField value={renderedAt} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <label htmlFor={emailId} className="sr-only">
          Email address
        </label>
        <input
          id={emailId}
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className={`flex-1 text-brand-black ${FIELD_CLASSES}`}
        />
        <WipeSubmitButton
          type="submit"
          disabled={!renderedAt || status === "submitting"}
          className={`${colours.button} px-6 py-3 text-lg text-brand-white text-center rounded-sm overflow-hidden${
            status === "submitting" ? " opacity-60" : ""
          }`}
          hoverBg="rgba(255,255,255,0.15)"
        >
          {status === "submitting" ? "Subscribing…" : "Subscribe"}
        </WipeSubmitButton>
      </div>

      {engaged && <TurnstileWidget />}

      {error && (
        <p role="alert" className={`text-lg ${colours.error}`}>
          {error}
        </p>
      )}
    </form>
  );
}
