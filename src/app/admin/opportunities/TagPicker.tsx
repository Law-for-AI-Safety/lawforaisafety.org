"use client";

import { useId, useRef, useState } from "react";
import { useComboboxNav } from "../useComboboxNav";

/**
 * Tags as removable chips plus a type-to-search add box, so the same tag is reused instead of
 * near-duplicates ("AI governance" vs "AI Governance") piling up across listings. Follows the
 * ARIA combobox pattern, same shape as `../task-tracker/DependencyPicker.tsx`; unlike that
 * picker, typing a tag that doesn't match anything existing still offers it, as a new tag.
 */
export default function TagPicker({
  value,
  onChange,
  suggestions,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
}) {
  const listboxId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const { open, setOpen, activeIndex, setActiveIndex, handleKeyDown, reset } = useComboboxNav();

  const needle = query.trim().toLowerCase();
  const chosen = new Set(value.map((tag) => tag.toLowerCase()));
  const matches = suggestions.filter(
    (tag) => !chosen.has(tag.toLowerCase()) && (!needle || tag.toLowerCase().includes(needle)),
  );
  const canAddNew = needle !== "" && !suggestions.some((tag) => tag.toLowerCase() === needle) && !chosen.has(needle);
  const options = [...matches, ...(canAddNew ? [query.trim()] : [])];
  const active = options[Math.min(activeIndex, options.length - 1)];

  function add(tag: string) {
    if (!chosen.has(tag.toLowerCase())) onChange([...value, tag]);
    setQuery("");
    reset();
    inputRef.current?.focus();
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="font-sans text-brand-black">
        Tags
      </label>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <li key={tag} className="flex items-center gap-1 border border-brand-black/20 px-2 py-0.5 text-sm text-brand-navy/70">
              {tag}
              <button type="button" onClick={() => remove(tag)} aria-label={`Remove ${tag}`} className="text-brand-black/60">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative flex flex-col gap-1">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && active ? `${listboxId}-${active}` : undefined}
          placeholder="Start typing a tag…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => handleKeyDown(event, options.length, (index) => add(options[index]))}
          className="border border-brand-black/30 bg-brand-white px-3 py-2"
        />
        {open && options.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Tags"
            className="absolute top-full right-0 left-0 z-10 max-h-72 overflow-y-auto border border-brand-black/30 bg-brand-white"
          >
            {options.map((tag, index) => {
              const isNew = canAddNew && index === options.length - 1;
              const isActive = tag === active;
              return (
                <li
                  key={tag}
                  id={`${listboxId}-${tag}`}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    add(tag);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`cursor-pointer px-3 py-2 text-brand-black ${isActive ? "bg-brand-navy/10" : ""}`}
                >
                  {isNew ? <>Add &ldquo;{tag}&rdquo; as a new tag</> : tag}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
