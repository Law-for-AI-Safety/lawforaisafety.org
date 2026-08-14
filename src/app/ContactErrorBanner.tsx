"use client";

import { useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  validation:
    "Provide at least one of: LinkedIn profile URL, CV upload, or a position statement.",
  invalid: "That verification link isn't valid. Please try again below.",
  expired: "That verification attempt expired. Please try again below.",
  verification: "We couldn't verify you're not a robot. Please try again below.",
};

export default function ContactErrorBanner() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const errorMessage = error ? ERROR_MESSAGES[error] : null;
  if (errorMessage) {
    return (
      <p className="rounded-sm border border-brand-red bg-brand-red/10 px-4 py-3 text-lg text-brand-red">
        {errorMessage}
      </p>
    );
  }

  return null;
}
