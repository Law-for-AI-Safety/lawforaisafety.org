"use client";

import { useEffect, useRef } from "react";
import { FORM_RENDERED_AT_FIELD_NAME } from "@/lib/abuse-protection";

/**
 * The hidden time the form appeared in the browser, which `looksLikeBot` uses to drop
 * submissions made faster than a person could fill the form in.
 *
 * The pages are prerendered, so the server HTML leaves it empty and the browser fills it once
 * the form has mounted. A post from that HTML without the browser running it, such as a bot
 * that scrapes the page, arrives empty and is treated as a bot.
 */
export default function RenderedAtField() {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.value = String(Date.now());
  }, []);

  return <input ref={ref} type="hidden" name={FORM_RENDERED_AT_FIELD_NAME} defaultValue="" />;
}
