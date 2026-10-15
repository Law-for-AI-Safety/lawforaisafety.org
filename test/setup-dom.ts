import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Everything a component test fakes from the framework is listed here. These modules need
// Next's runtime mounted; the stand-ins behave as they would in a browser.
vi.mock("next/navigation", () => import("./next-navigation"));
// Third-party scripts such as Turnstile's never load; test/fakes/ plays their part.
vi.mock("next/script", () => ({ default: () => null }));

// jsdom has no layout, so it has no ResizeObserver or IntersectionObserver (the nav uses one
// to follow the section in view). Nothing is ever observed to change.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.IntersectionObserver ??= class {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
};

// Under vitest's jsdom environment, TextEncoder hands back a Uint8Array made in another realm,
// so `bytes instanceof Uint8Array` is false here, unlike in Node or a browser. Libraries that
// check it, such as jose when it signs the admin session cookie, then refuse their input. The
// stand-in returns this realm's Uint8Array; the bytes are the same.
if (!(new TextEncoder().encode("") instanceof Uint8Array)) {
  const RealmTextEncoder = globalThis.TextEncoder;
  globalThis.TextEncoder = class extends RealmTextEncoder {
    encode(input?: string): Uint8Array<ArrayBuffer> {
      return new Uint8Array(super.encode(input));
    }
  };
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});
