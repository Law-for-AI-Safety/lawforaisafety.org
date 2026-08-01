"use client";

import { useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  validation:
    "Provide at least one of: LinkedIn profile URL, CV upload, or a position statement.",
  invalid: "That verification link isn't valid. Please try again below.",
  expired: "That verification attempt expired. Please try again below.",
};

const NEWSLETTER_MESSAGES: Record<string, string> = {
  confirmed: "Subscription confirmed. You're on the list.",
  invalid: "That confirmation link isn't valid or has already been used.",
};

export default function ContactErrorBanner() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const newsletter = searchParams.get("newsletter");

  const errorMessage = error ? ERROR_MESSAGES[error] : null;
  if (errorMessage) {
    return (
      <p className="rounded-sm border border-brand-red bg-brand-red/10 px-4 py-3 text-lg text-brand-red">
        {errorMessage}
      </p>
    );
  }

  const newsletterMessage = newsletter ? NEWSLETTER_MESSAGES[newsletter] : null;
  if (newsletterMessage) {
    const isError = newsletter === "invalid";
    return (
      <p
        className={`rounded-sm border px-4 py-3 text-lg ${
          isError
            ? "border-brand-red bg-brand-red/10 text-brand-red"
            : "border-brand-navy bg-brand-navy/10 text-brand-navy"
        }`}
      >
        {newsletterMessage}
      </p>
    );
  }

  return null;
}
