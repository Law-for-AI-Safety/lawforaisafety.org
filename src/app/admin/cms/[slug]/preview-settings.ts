import { useSyncExternalStore } from "react";

/**
 * How each editor likes the preview, kept in their browser. Where the browser keeps nothing
 * (a private window, blocked storage), the choice lasts until the page is closed.
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

const listeners = new Set<() => void>();
let memory: string | null = null;
let last: { raw: string | null; settings: PreviewSettings } = { raw: null, settings: DEFAULTS };

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return memory;
  }
}

function parse(raw: string | null): PreviewSettings {
  try {
    const value = JSON.parse(raw ?? "{}") as Partial<PreviewSettings>;
    return {
      show: typeof value.show === "boolean" ? value.show : DEFAULTS.show,
      view: value.view === "mobile" ? "mobile" : "desktop",
      changes: typeof value.changes === "boolean" ? value.changes : DEFAULTS.changes,
    };
  } catch {
    return DEFAULTS;
  }
}

function snapshot(): PreviewSettings {
  const raw = read();
  if (raw !== last.raw) last = { raw, settings: parse(raw) };
  return last.settings;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(change: Partial<PreviewSettings>) {
  const raw = JSON.stringify({ ...snapshot(), ...change });
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
