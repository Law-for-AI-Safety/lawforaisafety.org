"use client";

export default function Checkbox({
  name,
  label,
}: {
  name: string;
  label: string;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <span className="relative inline-flex h-6 w-6 flex-shrink-0">
        <input
          type="checkbox"
          name={name}
          value="on"
          className="peer h-6 w-6 cursor-pointer appearance-none rounded-sm border border-brand-black/30 bg-brand-white transition-colors checked:border-brand-navy checked:bg-brand-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="pointer-events-none absolute inset-0 h-6 w-6 p-1 text-brand-white opacity-0 transition-opacity peer-checked:opacity-100"
        >
          <path
            d="M3 8.5l3 3 7-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-lg text-brand-black">{label}</span>
    </label>
  );
}
