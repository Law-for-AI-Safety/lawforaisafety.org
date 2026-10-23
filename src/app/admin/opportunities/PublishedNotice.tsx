import Link from "next/link";
import type { Opportunity } from "@/opportunities/types";

const COPY: Record<"created" | "updated" | "removed", string> = {
  created: "Created and live now:",
  updated: "Saved:",
  removed: "Removed:",
};

export default function PublishedNotice({ opportunity, action }: { opportunity: Opportunity; action: "created" | "updated" | "removed" }) {
  return (
    <p className="border border-brand-black/20 bg-brand-navy/5 px-4 py-3 text-brand-black">
      {COPY[action]} <strong>{opportunity.title}</strong> at {opportunity.org}.{" "}
      {action === "removed" ? (
        <Link href="/admin/opportunities" className="underline">
          Back to all opportunities
        </Link>
      ) : (
        <Link href={`/opportunities/${opportunity.slug}`} className="underline">
          View it live
        </Link>
      )}
    </p>
  );
}
