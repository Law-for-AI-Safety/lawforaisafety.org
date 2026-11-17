"use client";

import { useRef } from "react";
import Script from "next/script";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type Turnstile = {
  render: (element: HTMLElement, options: Record<string, string>) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

/**
 * Renders Cloudflare Turnstile. The widget injects its own hidden
 * `cf-turnstile-response` input into this div once solved, so as long as
 * it sits inside the <form>, the token rides along with normal submission —
 * no extra wiring needed on the form's onSubmit.
 *
 * Rendered explicitly, each time the widget mounts: Cloudflare's implicit rendering only scans
 * the page once, when its script loads, so a form reached by client-side navigation (or mounted
 * later, like the footer's) would otherwise never get a token.
 *
 * `interaction-only`: the check still runs as soon as it renders, but the panel only
 * appears if Cloudflare decides this visitor has to tick the box. With the
 * default (`always`) the homepage carried two permanent grey "Success!"
 * panels, one per form. The inside of the panel is Cloudflare's iframe and
 * can't be restyled; theme and size are the only other levers — pinned to
 * light (the site has no dark mode, `auto` would follow the visitor's OS) and
 * flexible (fills the form's width instead of a fixed 300px box).
 */
export default function TurnstileWidget() {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  if (!SITE_KEY) return null;

  const render = () => {
    const element = box.current;
    if (!element || !window.turnstile || widget.current !== null) return;
    widget.current = window.turnstile.render(element, {
      sitekey: SITE_KEY,
      appearance: "interaction-only",
      theme: "light",
      size: "flexible",
    });
  };

  return (
    <>
      {/* `onReady` runs once the script has loaded, and again on every later mount. */}
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={render} />
      {/*
        The panel is Cloudflare's iframe, so its own corners can't be styled —
        but this box can clip them to the same radius as the buttons and
        inputs. Zero line-height because the iframe sits inline: without it
        the box is a few pixels taller than the panel and the bottom corners
        are clipped out of thin air instead of out of the panel.
      */}
      <div
        ref={(element) => {
          box.current = element;
          if (element) render();
          return () => {
            if (widget.current !== null) window.turnstile?.remove(widget.current);
            widget.current = null;
            box.current = null;
          };
        }}
        className="cf-turnstile overflow-hidden rounded-sm leading-[0]"
      />
    </>
  );
}
