"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  APPLICATION_SOURCES,
  APPLY_PAGES,
  AUDIENCE_LABELS,
  purposeFor,
  type ApplicationAudience,
  type ApplicationSource,
} from "@/lib/application-pages";

type ListedApplication = {
  id: string;
  name: string | null;
  organisation: string | null;
  authProvider: "linkedin" | "google" | "email";
  createdAtLabel: string;
  needsNotificationRetry: boolean;
  source: ApplicationSource;
  audience: ApplicationAudience;
};

type SourceFilter = "all" | ApplicationSource;

export default function AdminApplicationsList({
  applications,
}: {
  applications: ListedApplication[];
}) {
  const pathname = usePathname();
  const [filter, setFilter] = useState<SourceFilter>("all");

  const visible =
    filter === "all"
      ? applications
      : applications.filter((application) => application.source === filter);

  const tabs: { id: SourceFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: applications.length },
    ...APPLICATION_SOURCES.map((source) => ({
      id: source,
      label: APPLY_PAGES[source].label,
      count: applications.filter((application) => application.source === source).length,
    })),
  ];

  return (
    <>
      <div className="flex flex-wrap gap-2 px-4 pb-3" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={filter === tab.id}
            onClick={() => setFilter(tab.id)}
            className={`border px-3 py-1 text-sm transition-colors ${
              filter === tab.id
                ? "border-brand-navy bg-brand-navy text-brand-white"
                : "border-brand-black/20 text-brand-black/70 hover:text-brand-black"
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {applications.length === 0 ? (
        <p className="p-4 text-lg text-brand-black/70">Nothing waiting for review.</p>
      ) : visible.length === 0 ? (
        <p className="p-4 text-lg text-brand-black/70">
          Nothing from this source is waiting for review.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-brand-black/10">
          {visible.map((application) => {
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
                        Notification failed — retry
                      </p>
                    )}
                    <p className="truncate text-brand-black">
                      {application.name ?? "Unnamed applicant"}
                    </p>
                    <p className="truncate text-sm text-brand-black/60">
                      {application.organisation ?? "No organisation given"}
                    </p>
                    <p className="truncate text-sm font-semibold text-brand-navy">
                      {purposeFor(application.source)}
                    </p>
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
                    <span className="text-xs text-brand-black/60">
                      {AUDIENCE_LABELS[application.audience]}
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
      )}
    </>
  );
}
