import { useMemo, useSyncExternalStore } from "react";
import { vi } from "vitest";

/**
 * A stand-in for `next/navigation` in jsdom tests. The hooks read jsdom's real
 * `window.location`, so a test sets the URL with `window.history.replaceState` before
 * rendering, and a component that navigates is seen to do so. Navigations are also recorded
 * on `navigation`.
 */
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

for (const method of ["pushState", "replaceState"] as const) {
  const original = window.history[method].bind(window.history);
  window.history[method] = (...args: Parameters<History["pushState"]>) => {
    original(...args);
    notify();
  };
}
window.addEventListener("popstate", notify);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const navigation = {
  push: vi.fn((url: string) => window.history.pushState(null, "", url)),
  replace: vi.fn((url: string) => window.history.replaceState(null, "", url)),
  back: vi.fn(() => window.history.back()),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

export function useRouter() {
  return navigation;
}

export function usePathname() {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export function useSearchParams() {
  const search = useSyncExternalStore(subscribe, () => window.location.search);
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function redirect(url: string): never {
  throw new Error(`NEXT_REDIRECT:${url}`);
}

export function notFound(): never {
  throw new Error("NEXT_NOT_FOUND");
}
