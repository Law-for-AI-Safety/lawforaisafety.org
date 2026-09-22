"use client";

import { useState } from "react";

/**
 * useState for a form field whose saved value can change underneath it —
 * e.g. a status change fills in "Actual start" on the server, then
 * router.refresh() hands the form a new prop. If the field is untouched it
 * follows the new saved value; if the person has edited it, their edit is
 * kept. Without this the form would keep showing the old blank value, look
 * "unsaved", and a later Save would wipe the automatic date.
 */
export function useServerValue<T>(serverValue: T, isEqual: (a: T, b: T) => boolean = Object.is) {
  const [value, setValue] = useState(serverValue);
  const [lastServerValue, setLastServerValue] = useState(serverValue);

  // Adjusting state during render is React's recommended pattern for
  // "reset when a prop changes" — no effect, no flash of the stale value.
  if (!isEqual(serverValue, lastServerValue)) {
    setLastServerValue(serverValue);
    if (isEqual(value, lastServerValue)) setValue(serverValue);
  }

  return [value, setValue] as const;
}
