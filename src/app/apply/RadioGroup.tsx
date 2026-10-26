"use client";

/** A row of choices styled as buttons; a real radio group underneath, so it posts and is kept like one. */
export default function RadioGroup<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: { id: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3" role="radiogroup">
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <label
            key={option.id}
            className={`cursor-pointer rounded-sm border px-5 py-3 text-lg transition-colors ${
              selected
                ? "border-brand-navy bg-brand-navy text-brand-white"
                : "border-brand-black/30 text-brand-black hover:border-brand-navy"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={selected}
              onChange={() => onChange(option.id)}
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
