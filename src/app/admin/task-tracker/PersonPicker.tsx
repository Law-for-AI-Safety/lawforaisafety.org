"use client";

import { useId, useRef, useState } from "react";
import { personLabel, type Person } from "./people";

export type { Person };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Picks a person by name from everyone who has signed into the admin panel,
 * falling back to a typed email address for anyone who hasn't yet. The value
 * saved is always the email — names change, and nothing else in the tracker
 * keys off them.
 */
export default function PersonPicker({
  label,
  value,
  onChange,
  people,
  currentUser,
}: {
  label: string;
  value: string;
  onChange: (email: string) => void;
  people: Person[];
  /** The signed-in person, offered as a one-click "Assign to me". */
  currentUser?: Person;
}) {
  const inputId = useId();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedName = personLabel(value, people);
  const needle = query.trim().toLowerCase();
  const matches = people.filter(
    (person) =>
      person.email.toLowerCase() !== value.toLowerCase() &&
      (!needle ||
        person.name.toLowerCase().includes(needle) ||
        person.email.toLowerCase().includes(needle)),
  );

  // Anyone who hasn't logged in yet can still be assigned by typing their
  // address — the tracker is used by volunteers who come and go.
  const typedEmail =
    EMAIL_PATTERN.test(query.trim()) &&
    !people.some((person) => person.email.toLowerCase() === query.trim().toLowerCase())
      ? query.trim()
      : null;
  const options: Person[] = [
    ...(typedEmail ? [{ email: typedEmail, name: typedEmail }] : []),
    ...matches,
  ];
  const active = options[Math.min(activeIndex, options.length - 1)];

  function choose(email: string) {
    onChange(email);
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (options.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      const current = Math.min(activeIndex, options.length - 1);
      setActiveIndex((current + step + options.length) % options.length);
    } else if (event.key === "Enter") {
      event.preventDefault(); // never submits the surrounding form
      if (open && active) choose(active.email);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  const canAssignToSelf =
    currentUser && currentUser.email.toLowerCase() !== value.toLowerCase();

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="font-sans text-brand-black">
        {label}
      </label>

      <p className="text-sm text-brand-black/70">
        {value ? (
          <>
            <span className="text-brand-black">{selectedName}</span>
            {selectedName !== value && <span> · {value}</span>}
          </>
        ) : (
          "Unassigned"
        )}
      </p>

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
          aria-activedescendant={open && active ? `${listboxId}-${active.email}` : undefined}
          placeholder={value ? "Change person…" : "Search by name, or type an email…"}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          className="border border-brand-black/30 bg-brand-white px-3 py-2"
        />

        {open && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={label}
            className="absolute top-full right-0 left-0 z-10 max-h-72 overflow-y-auto border border-brand-black/30 bg-brand-white"
          >
            {options.length === 0 && (
              <li className="px-3 py-2 text-sm text-brand-black/70">
                {people.length === 0
                  ? "Nobody has signed in yet — type an email address."
                  : "No match. Type a full email address to use it anyway."}
              </li>
            )}
            {options.map((person) => (
              <li
                key={person.email}
                id={`${listboxId}-${person.email}`}
                role="option"
                aria-selected={person.email === active?.email}
                // mousedown so the input's blur doesn't close the list first
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(person.email);
                }}
                onMouseEnter={() => setActiveIndex(options.indexOf(person))}
                className={`cursor-pointer px-3 py-2 ${
                  person.email === active?.email ? "bg-brand-navy/10" : ""
                }`}
              >
                <span className="text-brand-black">{person.name}</span>
                {person.name !== person.email && (
                  <span className="block text-sm text-brand-black/70">{person.email}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {canAssignToSelf && (
          <button type="button" onClick={() => choose(currentUser.email)} className="underline">
            Assign to me
          </button>
        )}
        {value && (
          <button type="button" onClick={() => choose("")} className="underline">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
