"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { HONEYPOT_FIELD_NAME } from "@/lib/abuse-protection";

/**
 * Keeps what a visitor typed into an application form when the server refuses the
 * submission. The forms post natively and the server answers a refusal by redirecting back to
 * the page with `?error=<code>`, which would otherwise load an empty form.
 *
 * Just before the form posts, `keepInput` copies the visitor's own entries to sessionStorage
 * (this tab only): text and date fields, choices, and any checkboxes the form names. It never keeps
 * hidden fields (the bot-check time, Turnstile's token, the page source), files, passwords or
 * the honeypot, and never a checkbox the form does not name, so consent is always ticked
 * again. When the page loads with an error code within 30 minutes, `useKeptInput` hands the
 * entries back once and deletes them (the next submission keeps its own). Any other load (a
 * success, a fresh visit, an expired entry) deletes them.
 *
 * The entries arrive in the render after hydration, as `RenderedAtField`'s time does, so the
 * prerendered HTML and the first browser render match. Storage that is unavailable or throws
 * only means nothing is kept.
 */

export type KeptInput = { values: Record<string, string>; checked: string[] };

/** How long kept entries may be restored after the submission that kept them. */
export const KEPT_INPUT_TTL_MS = 30 * 60 * 1000;

const PREFIX = "kept-form-input:";
const TEXT_TYPES = new Set(["text", "email", "url", "number", "tel", "search", "date"]);

export function keepInput(formKey: string, form: HTMLFormElement, keepCheckboxes: readonly string[] = []): void {
  const kept: KeptInput & { savedAt: number } = { savedAt: Date.now(), values: {}, checked: [] };
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
    const value = JSON.parse(raw) as Partial<KeptInput & { savedAt: unknown }>;
    const age = Date.now() - Number(value.savedAt);
    if (!(age >= 0 && age <= KEPT_INPUT_TTL_MS)) return null;
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
  // A cached entry is checked again, as it may have expired since.
  if (hit?.raw === raw && (hit.kept === null || parse(raw) !== null)) return hit.kept;
  const kept = parse(raw);
  cache.set(formKey, { raw, kept });
  return kept;
}

/** The entries kept from a refused submission of this form, or null (always null before hydration). */
export function useKeptInput(formKey: string): KeptInput | null {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(formKey),
    () => null,
  );
  // Held for the life of the form, so deleting the stored copy does not empty the fields.
  const [held, setHeld] = useState<KeptInput | null>(null);
  if (held === null && stored !== null) setHeld(stored);
  const kept = held ?? stored;

  useEffect(() => {
    // Entries still waiting to be restored (in the render after hydration) are left alone.
    if (kept === null && read(formKey) !== null) return;
    try {
      sessionStorage.removeItem(PREFIX + formKey);
    } catch {
      // Nothing to clear.
    }
  }, [formKey, kept]);
  return kept;
}
