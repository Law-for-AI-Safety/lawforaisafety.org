import Link from "next/link";
import type { Opportunity } from "@/opportunities/types";

type Action = "created" | "drafted" | "published" | "updated" | "removed";

const COPY: Record<Action, string> = {
  created: "Created and live now:",
  drafted: "Saved as a draft, not yet on the site:",
  published: "Published and live now:",
  updated: "Saved:",
  removed: "Removed:",
};

/** The admin preview of a listing, which shows drafts too. */
export function previewHref(opportunity: Pick<Opportunity, "slug">): string {
  return `/admin/preview/opportunities/${opportunity.slug}`;
}

function Next({ opportunity, action }: { opportunity: Opportunity; action: Action }) {
  if (action === "removed") {
    return (
      <Link href="/admin/opportunities" className="underline">
        Back to all opportunities
      </Link>
    );
  }
  if (opportunity.status === "draft") {
    return (
      <>
        <Link href={previewHref(opportunity)} className="underline">
          Preview it
        </Link>{" "}
        or{" "}
        <Link href={`/admin/opportunities/${opportunity.slug}`} className="underline">
          edit and publish it
        </Link>
      </>
    );
  }
  return (
    <Link href={`/opportunities/${opportunity.slug}`} className="underline">
      View it live
    </Link>
  );
}

export default function PublishedNotice({ opportunity, action }: { opportunity: Opportunity; action: Action }) {
  return (
    <p className="border border-brand-black/20 bg-brand-navy/5 px-4 py-3 text-brand-black">
      {COPY[action]} <strong>{opportunity.title}</strong> at {opportunity.org}. <Next opportunity={opportunity} action={action} />
    </p>
  );
}
