import type { PublishedResult } from "./api";

export default function PublishedNotice({ result, verb }: { result: PublishedResult; verb: string }) {
  return (
    <p className="border border-brand-black/20 bg-brand-navy/5 px-4 py-3 text-brand-black">
      Opened pull request #{result.number} to {verb}.{" "}
      <a href={result.url} target="_blank" rel="noreferrer" className="underline">
        Review it on GitHub
      </a>
      . Merging it makes the change live.
    </p>
  );
}
