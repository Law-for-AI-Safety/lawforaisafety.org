"use client";

import { useState, useSyncExternalStore } from "react";
import { FORM_RENDERED_AT_FIELD_NAME } from "@/lib/abuse-protection";

const subscribe = () => () => {};

/**
 * The time the form appeared in the browser, which `looksLikeBot` uses to drop submissions
 * made faster than a person could fill the form in. Empty until the form is running in the
 * browser.
 *
 * The pages are prerendered, so the server HTML carries it empty, and a post from that HTML
 * without the browser running it, such as a bot that scrapes the page, is treated as a bot.
 * A form keeps its submit controls disabled while this is empty (`disabled={!renderedAt}`):
 * Turnstile is a plain script that can finish before React hydrates, and a person who
 * submitted then would be silently dropped as a bot. The value and the controls change in the
 * same render, so a control is never enabled without the time.
 */
export function useRenderedAt(): string {
  const [mountedAt] = useState(() => String(Date.now()));
  const inBrowser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return inBrowser ? mountedAt : "";
}

export default function RenderedAtField({ value }: { value: string }) {
  return <input type="hidden" name={FORM_RENDERED_AT_FIELD_NAME} value={value} readOnly />;
}
