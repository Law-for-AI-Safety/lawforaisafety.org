"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ListedApplication = {
  id: string;
  name: string | null;
  affiliation: string | null;
  areaOfExpertise: "legal_governance" | "technical" | null;
  createdAtLabel: string;
};

const AREA_LABELS: Record<string, string> = {
  legal_governance: "Legal / governance",
  technical: "Technical",
};

export default function AdminRedLinesList({
  applications,
  basePath = "/admin/red-lines-dialogue",
}: {
  applications: ListedApplication[];
  basePath?: string;
}) {
  const pathname = usePathname();

  if (applications.length === 0) {
    return (
      <p className="p-4 text-lg text-brand-black/70">
        Nothing waiting for review.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-brand-black/10">
      {applications.map((application) => {
        const href = `${basePath}/${application.id}`;
        const isActive = pathname === href;

        return (
          <li key={application.id}>
            <Link
              href={href}
              className={`flex items-center justify-between gap-3 px-4 py-4 transition-colors ${
                isActive ? "bg-brand-navy/10" : "hover:bg-brand-black/5"
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-brand-black">
                  {application.name ?? "Unnamed applicant"}
                </p>
                <p className="truncate text-sm text-brand-black/60">
                  {application.affiliation ?? "No affiliation given"}
                </p>
              </div>
              <div className="flex flex-shrink-0 flex-col items-end gap-1">
                {application.areaOfExpertise && (
                  <span className="border border-brand-navy px-2 py-1 text-xs uppercase text-brand-navy">
                    {AREA_LABELS[application.areaOfExpertise]}
                  </span>
                )}
                <span className="text-sm text-brand-black/60">
                  {application.createdAtLabel}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
