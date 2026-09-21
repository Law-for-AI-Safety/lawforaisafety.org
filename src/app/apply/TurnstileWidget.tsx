"use client";

import Script from "next/script";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Renders Cloudflare Turnstile. The widget injects its own hidden
 * `cf-turnstile-response` input into this div once solved, so as long as
 * it sits inside the <form>, the token rides along with normal submission —
 * no extra wiring needed on the form's onSubmit.
 *
 * `interaction-only`: the check still runs on page load, but the panel only
 * appears if Cloudflare decides this visitor has to tick the box. With the
 * default (`always`) the homepage carried two permanent grey "Success!"
 * panels, one per form. The inside of the panel is Cloudflare's iframe and
 * can't be restyled; theme and size are the only other levers — pinned to
 * light (the site has no dark mode, `auto` would follow the visitor's OS) and
 * flexible (fills the form's width instead of a fixed 300px box).
 */
export default function TurnstileWidget() {
  if (!SITE_KEY) return null;

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      {/*
        The panel is Cloudflare's iframe, so its own corners can't be styled —
        but this box can clip them to the same radius as the buttons and
        inputs. Zero line-height because the iframe sits inline: without it
        the box is a few pixels taller than the panel and the bottom corners
        are clipped out of thin air instead of out of the panel.
      */}
      <div
        className="cf-turnstile overflow-hidden rounded-sm leading-[0]"
        data-sitekey={SITE_KEY}
        data-appearance="interaction-only"
        data-theme="light"
        data-size="flexible"
      />
    </>
  );
}
