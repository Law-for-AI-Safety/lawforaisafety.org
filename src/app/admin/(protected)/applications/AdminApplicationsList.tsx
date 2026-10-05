"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ApplicationSource =
  | "homepage"
  | "mep_outreach"
  | "council_of_europe"
  | "field_building";

type ListedApplication = {
  id: string;
  name: string | null;
  organisation: string | null;
  authProvider: "linkedin" | "google" | "email";
  createdAtLabel: string;
  needsNotificationRetry: boolean;
  source: ApplicationSource;
};

const SOURCE_LABELS: Record<ApplicationSource, string> = {
  homepage: "Homepage",
  mep_outreach: "MEP Outreach",
  council_of_europe: "Council of Europe",
  field_building: "Field-building",
};

export default function AdminApplicationsList({
  applications,
}: {
  applications: ListedApplication[];
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
        const href = `/admin/applications/${application.id}`;
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
                {application.needsNotificationRetry && (
                  <p className="truncate text-sm font-semibold text-brand-red">
                    Notification failed: retry
                  </p>
                )}
                <p className="truncate text-brand-black">
                  {application.name ?? "Unnamed applicant"}
                </p>
                <p className="truncate text-sm text-brand-black/60">
                  {application.organisation ?? "No organisation given"}
                </p>
                {application.source !== "homepage" && (
                  <p className="truncate text-sm font-semibold text-brand-navy">
                    {SOURCE_LABELS[application.source]}
                  </p>
                )}
              </div>
              <div className="flex flex-shrink-0 flex-col items-end gap-1">
                <span
                  className={`border px-2 py-1 text-xs uppercase ${
                    application.authProvider === "email"
                      ? "border-brand-red text-brand-red"
                      : "border-brand-navy text-brand-navy"
                  }`}
                >
                  {application.authProvider === "email"
                    ? "Email only"
                    : application.authProvider}
                </span>
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
