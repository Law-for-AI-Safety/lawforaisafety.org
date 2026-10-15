"use client";

import { useEffect, useSyncExternalStore } from "react";
import { HONEYPOT_FIELD_NAME } from "@/lib/abuse-protection";

/**
 * Keeps what a visitor typed into an application form when the server refuses the
 * submission. The forms post natively and the server answers a refusal by redirecting back to
 * the page with `?error=<code>`, which would otherwise load an empty form.
 *
 * Just before the form posts, `keepInput` copies the visitor's own entries to sessionStorage
 * (this tab only): text fields, choices, and any checkboxes the form names. It never keeps
 * hidden fields (the bot-check time, Turnstile's token, the page source), files, passwords or
 * the honeypot, and never a checkbox the form does not name, so consent is always ticked
 * again. When the page loads with an error code, `useKeptInput` hands the entries back; any
 * other load (a success, a fresh visit) deletes them.
 *
 * The entries arrive in the render after hydration, as `RenderedAtField`'s time does, so the
 * prerendered HTML and the first browser render match. Storage that is unavailable or throws
 * only means nothing is kept.
 */

export type KeptInput = { values: Record<string, string>; checked: string[] };

const PREFIX = "kept-form-input:";
const TEXT_TYPES = new Set(["text", "email", "url", "number", "tel", "search"]);

export function keepInput(formKey: string, form: HTMLFormElement, keepCheckboxes: readonly string[] = []): void {
  const kept: KeptInput = { values: {}, checked: [] };
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) continue;
    const { name } = element;
    if (!name || name === HONEYPOT_FIELD_NAME) continue;
    if (element instanceof HTMLTextAreaElement || TEXT_TYPES.has(element.type)) {
      if (element.value) kept.values[name] = element.value;
    } else if (element.type === "radio") {
      if (element.checked) kept.values[name] = element.value;
    } else if (element.type === "checkbox" && keepCheckboxes.includes(name) && element.checked) {
      kept.checked.push(name);
    }
  }
  try {
    sessionStorage.setItem(PREFIX + formKey, JSON.stringify(kept));
  } catch {
    // Nothing is kept; the submission goes ahead.
  }
}

const subscribe = () => () => {};

function hasErrorCode(): boolean {
  return Boolean(new URLSearchParams(window.location.search).get("error"));
}

/** Parsed entries, cached by their stored text so each read of the same text is the same object. */
const cache = new Map<string, { raw: string; kept: KeptInput | null }>();

function parse(raw: string): KeptInput | null {
  try {
    const value = JSON.parse(raw) as Partial<KeptInput>;
    const values = value.values && typeof value.values === "object" ? value.values : {};
    return {
      values: Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === "string")),
      checked: Array.isArray(value.checked) ? value.checked.filter((c) => typeof c === "string") : [],
    };
  } catch {
    return null;
  }
}

function read(formKey: string): KeptInput | null {
  if (!hasErrorCode()) return null;
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(PREFIX + formKey);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const hit = cache.get(formKey);
  if (hit?.raw === raw) return hit.kept;
  const kept = parse(raw);
  cache.set(formKey, { raw, kept });
  return kept;
}

/** The entries kept from a refused submission of this form, or null (always null before hydration). */
export function useKeptInput(formKey: string): KeptInput | null {
  const kept = useSyncExternalStore(
    subscribe,
    () => read(formKey),
    () => null,
  );
  useEffect(() => {
    if (hasErrorCode()) return;
    try {
      sessionStorage.removeItem(PREFIX + formKey);
    } catch {
      // Nothing to clear.
    }
  }, [formKey]);
  return kept;
}
