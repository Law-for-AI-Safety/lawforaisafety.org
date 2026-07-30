import React from "react";

export default function WavyUnderline({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-block pb-1">
      {children}
      <svg
        className="absolute -bottom-1 left-0 w-full"
        viewBox="0 0 52 12"
        height="13"
        preserveAspectRatio="none"
        aria-hidden
        fill="none"
      >
        <path d="M0 5 C14 2 38 8 52 5 C38 10 14 7 0 5Z" fill="#9b1c1f" />
      </svg>
    </span>
  );
}
