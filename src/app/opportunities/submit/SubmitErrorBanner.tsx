"use client";

import { useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  validation: "Some required details were missing. Please check the form and try again below.",
  toolong: "One of your answers is too long. Please shorten it and try again below.",
  url: "One of the links doesn't look right. It should start with https://",
  date: "One of the dates doesn't look right, or the end date is before the start date.",
  eventdate: "An event needs its date. Please add it and try again below.",
  name: "Please enter your name without special characters like < or >.",
  email: "That email address doesn't look right. Please check it and try again below.",
  sendfailed: "We couldn't send your confirmation email. Please try again below in a few minutes.",
  invalid: "That verification link isn't valid. Please try again below.",
  expired: "That verification attempt expired. Please try again below.",
  verification: "We couldn't verify you're not a robot. Please try again below.",
  ratelimit: "That was a lot of attempts in a short time. Please wait a minute and try again below.",
};

export default function SubmitErrorBanner() {
  const error = useSearchParams().get("error");

  // Own keys only: a code such as "toString" or "__proto__" must not reach Object.prototype.
  const errorMessage = error && Object.hasOwn(ERROR_MESSAGES, error) ? ERROR_MESSAGES[error] : null;
  if (!errorMessage) return null;

  return (
    <p role="alert" className="rounded-sm border border-brand-red bg-brand-red/10 px-4 py-3 text-lg text-brand-red">
      {errorMessage}
    </p>
  );
}
