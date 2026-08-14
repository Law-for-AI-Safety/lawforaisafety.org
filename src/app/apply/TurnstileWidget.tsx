"use client";

import Script from "next/script";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Renders Cloudflare Turnstile. The widget injects its own hidden
 * `cf-turnstile-response` input into this div once solved, so as long as
 * it sits inside the <form>, the token rides along with normal submission —
 * no extra wiring needed on the form's onSubmit.
 */
export default function TurnstileWidget() {
  if (!SITE_KEY) return null;

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <div className="cf-turnstile" data-sitekey={SITE_KEY} />
    </>
  );
}
