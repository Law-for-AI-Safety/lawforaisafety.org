"use client";

import { useState } from "react";

/**
 * Open/active-index state and keyboard handling shared by the admin pickers that follow the
 * ARIA combobox pattern (arrow keys cycle, Enter picks, Escape closes) - `TagPicker`,
 * `DependencyPicker`. `navLength` is how many items Up/Down can land on: usually the same
 * as what's rendered, but a picker that also renders unpickable options (e.g.
 * `DependencyPicker`'s already-satisfied dependencies) passes the smaller, pickable count so
 * arrow-key cycling skips over them.
 */
export function useComboboxNav() {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
    navLength: number,
    onSelect: (index: number) => void,
  ) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (navLength === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      const current = Math.min(activeIndex, navLength - 1);
      setActiveIndex((current + step + navLength) % navLength);
    } else if (event.key === "Enter") {
      event.preventDefault(); // never submit the surrounding form from inside the search box
      if (open && navLength > 0) onSelect(Math.min(activeIndex, navLength - 1));
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  /** Call after picking an option, to collapse back to a clean, top-of-list state. */
  function reset() {
    setActiveIndex(0);
  }

  return { open, setOpen, activeIndex, setActiveIndex, handleKeyDown, reset };
}
