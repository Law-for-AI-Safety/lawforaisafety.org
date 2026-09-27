"use client";

import { useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  validation: "Motivation and affiliation are required.",
  toolong: "One of your answers is too long. Please shorten it and try again below.",
  hours: "Enter your available hours as a number.",
  linkedin: "That doesn't look like a LinkedIn profile URL. It should start with https://www.linkedin.com/in/",
  name: "Please enter your name without special characters like < or >.",
  email: "That email address doesn't look right. Please check it and try again below.",
  sendfailed: "We couldn't send your confirmation email. Please try again below in a few minutes.",
  invalid: "That verification link isn't valid. Please try again below.",
  expired: "That verification attempt expired. Please try again below.",
  verification: "We couldn't verify you're not a robot. Please try again below.",
  ratelimit: "That was a lot of attempts in a short time. Please wait a minute and try again below.",
  closed: "Applications aren't open right now. Please email redlinesdialogue@lawforaisafety.org instead.",
};

export default function RedLinesErrorBanner() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const errorMessage = error ? ERROR_MESSAGES[error] : null;
  if (!errorMessage) return null;

  return (
    <p className="rounded-sm border border-brand-red bg-brand-red/10 px-4 py-3 text-lg text-brand-red">
      {errorMessage}
    </p>
  );
}
