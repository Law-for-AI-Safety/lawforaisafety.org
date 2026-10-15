"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const currentYear = () => new Date().getFullYear();

/**
 * The copyright year. The footer is prerendered, so the HTML carries the year the site was
 * built (`builtYear`, passed down so hydration matches it), and the browser then shows the
 * year it is now.
 */
export default function FooterYear({ builtYear }: { builtYear: number }) {
  return useSyncExternalStore(subscribe, currentYear, () => builtYear);
}
