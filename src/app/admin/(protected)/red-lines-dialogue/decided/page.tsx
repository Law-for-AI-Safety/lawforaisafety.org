import type { Metadata } from "next";
import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { redLinesApplications } from "@/drizzle/schema";

export const metadata: Metadata = {
  title: "LAIS - Red Lines Dialogues decided applications",
  robots: { index: false, follow: false },
};

const AREA_LABELS: Record<string, string> = {
  legal_governance: "Legal / governance",
  technical: "Technical",
};

/**
 * Read-only history: everyone approved or rejected. Kept in full (see
 * schema.ts) as the record of who was, and wasn't, invited — this is where
 * that record is actually browsable, since the sidebar workspace only shows
 * what's still actionable.
 */
export default async function RedLinesDecidedPage() {
  const decided = await db
    .select({
      id: redLinesApplications.id,
      name: redLinesApplications.name,
      affiliation: redLinesApplications.affiliation,
      areaOfExpertise: redLinesApplications.areaOfExpertise,
      status: redLinesApplications.status,
      reviewedAt: redLinesApplications.reviewedAt,
      reviewedBy: redLinesApplications.reviewedBy,
      contactedBy: redLinesApplications.contactedBy,
    })
    .from(redLinesApplications)
    .where(inArray(redLinesApplications.status, ["approved", "rejected"]))
    .orderBy(desc(redLinesApplications.reviewedAt));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-sans text-3xl text-brand-black">
          Decided applications
        </h1>
        <Link href="/admin/red-lines-dialogue" className="underline">
          Back to pending
        </Link>
      </div>

      {decided.length === 0 ? (
        <p className="text-brand-black/70">No decisions recorded yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-brand-black/10">
          {decided.map((application) => (
            <li key={application.id}>
              <Link
                href={`/admin/red-lines-dialogue/${application.id}`}
                className="flex items-center justify-between gap-3 py-4 transition-colors hover:bg-brand-black/5"
              >
                <div className="min-w-0">
                  {!application.contactedBy && (
                    <p className="truncate text-sm font-semibold text-brand-red">
                      Not yet contacted
                    </p>
                  )}
                  <p className="truncate text-brand-black">
                    {application.name ?? "Unnamed applicant"}
                  </p>
                  <p className="truncate text-sm text-brand-black/60">
                    {application.affiliation ?? "No affiliation given"}
                    {application.areaOfExpertise &&
                      ` · ${AREA_LABELS[application.areaOfExpertise]}`}
                  </p>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1">
                  <span
                    className={`border px-2 py-1 text-xs uppercase ${
                      application.status === "approved"
                        ? "border-brand-navy text-brand-navy"
                        : "border-brand-red text-brand-red"
                    }`}
                  >
                    {application.status}
                  </span>
                  <span className="text-sm text-brand-black/60">
                    {application.reviewedAt
                      ? new Date(application.reviewedAt).toLocaleDateString()
                      : ""}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
