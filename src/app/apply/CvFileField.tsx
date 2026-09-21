"use client";

import { useState, type RefObject } from "react";

const MAX_LABEL = "PDF, max 5 MB";

function UploadIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M12 3v12" strokeLinecap="round" />
      <path d="M7 8l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
    </svg>
  );
}

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CvFileField({
  name,
  inputRef,
}: {
  name: string;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <label className="block cursor-pointer">
        <span
          className={`flex items-center gap-3 rounded-sm border border-dashed px-4 py-3 transition-colors ${
            file
              ? "border-brand-navy bg-brand-navy/5"
              : "border-brand-black/30 hover:border-brand-navy/60"
          }`}
        >
          <UploadIcon />
          <span className="flex-1 min-w-0">
            {file ? (
              <>
                <span className="block truncate text-lg text-brand-black">{file.name}</span>
                <span className="block text-lg text-brand-black/60">
                  {formatSize(file.size)}
                </span>
              </>
            ) : (
              <span className="text-lg text-brand-black/70">
                Click to upload your CV{" "}
                <span className="text-brand-black/50">({MAX_LABEL})</span>
              </span>
            )}
          </span>
          {file && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                if (inputRef.current) inputRef.current.value = "";
                setFile(null);
              }}
              className="text-lg text-brand-black/60 underline hover:text-brand-red"
            >
              Remove
            </button>
          )}
        </span>
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept="application/pdf"
          className="sr-only"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            setFile(selected ? { name: selected.name, size: selected.size } : null);
          }}
        />
      </label>
    </div>
  );
}
