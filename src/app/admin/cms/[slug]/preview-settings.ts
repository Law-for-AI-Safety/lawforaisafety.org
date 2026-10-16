import { useSyncExternalStore } from "react";

/**
 * How each editor likes the preview, kept in their browser. Where the browser keeps nothing
 * (a private window, blocked storage), the choice lasts until the page is closed. Only the
 * choices made are kept: until one is made, a phone-sized screen previews the mobile layout
 * and a larger one the desktop layout.
 */
export type PreviewSettings = {
  /** Whether the preview shows beside the fields. */
  show: boolean;
  view: "desktop" | "mobile";
  /** Whether blocks that differ from the live page are marked. */
  changes: boolean;
};

const KEY = "cms-editor-preview";
const DEFAULTS: PreviewSettings = { show: true, view: "desktop", changes: false };

/** Below Tailwind's `md` breakpoint, where the site itself shows its mobile layout. */
const PHONE = "(max-width: 47.99rem)";

const listeners = new Set<() => void>();
let memory: string | null = null;
let last: { raw: string | null; phone: boolean; settings: PreviewSettings } | null = null;

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return memory;
  }
}

/** The choices made so far; anything not understood counts as not chosen. */
function chosen(raw: string | null): Partial<PreviewSettings> {
  let value: Partial<Record<keyof PreviewSettings, unknown>>;
  try {
    value = Object(JSON.parse(raw ?? "{}"));
  } catch {
    return {};
  }
  return {
    ...(typeof value.show === "boolean" ? { show: value.show } : {}),
    ...(value.view === "desktop" || value.view === "mobile" ? { view: value.view } : {}),
    ...(typeof value.changes === "boolean" ? { changes: value.changes } : {}),
  };
}

function snapshot(): PreviewSettings {
  const raw = read();
  const phone = window.matchMedia?.(PHONE).matches ?? false;
  if (last === null || raw !== last.raw || phone !== last.phone) {
    last = { raw, phone, settings: { ...DEFAULTS, view: phone ? "mobile" : DEFAULTS.view, ...chosen(raw) } };
  }
  return last.settings;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(change: Partial<PreviewSettings>) {
  const raw = JSON.stringify({ ...chosen(read()), ...change });
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    memory = raw;
  }
  for (const listener of listeners) listener();
}

export function usePreviewSettings(): [PreviewSettings, (change: Partial<PreviewSettings>) => void] {
  return [useSyncExternalStore(subscribe, snapshot, () => DEFAULTS), update];
}
