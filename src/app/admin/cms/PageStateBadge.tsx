import type { PageState } from "@/cms/drafts";

/** Draft: the page has saved changes that are not public. Live: what visitors see is the latest. */
export default function PageStateBadge({ state }: { state: PageState }) {
  return (
    <span
      className={`rounded-sm border px-2 py-0.5 text-sm ${
        state === "draft" ? "border-brand-red text-brand-red" : "border-brand-navy text-brand-navy"
      }`}
    >
      {state === "draft" ? "Draft" : "Live"}
    </span>
  );
}
