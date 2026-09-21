import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminAuditLog } from "@/drizzle/schema";
import {
  getAdminSession,
  isTechAdminConfigured,
  isTechAdminEmail,
} from "@/lib/session";
import TechAdminOnly from "../../TechAdminOnly";

export const metadata: Metadata = {
  title: "LAIS - Audit log",
  robots: { index: false, follow: false },
};

const ACTION_LABELS: Record<string, string> = {
  login: "Logged in",
  approve: "Approved an application",
  reject: "Rejected an application",
  erase: "Erased data",
  signup_toggle: "Changed public signup",
};

const MAX_ENTRIES = 100;

/**
 * Read-only view of admin_audit_log, newest first. Technical admins only:
 * a log that any signed-in account could read would also tell an intruder
 * exactly what had been noticed.
 */
export default async function AdminAuditLogPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!isTechAdminEmail(session.email)) {
    return <TechAdminOnly configured={isTechAdminConfigured()} />;
  }

  const entries = await db
    .select()
    .from(adminAuditLog)
    .orderBy(desc(adminAuditLog.at))
    .limit(MAX_ENTRIES);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="font-sans text-3xl text-brand-black">Audit log</h1>
        <p className="text-brand-black/70">
          The last {MAX_ENTRIES} actions taken in this panel, newest first.
          Applicants appear only as a one-way hash of their email, and not at
          all on erasures. Times are UTC.
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="text-brand-black/60">Nothing recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-brand-black/20 text-brand-black">
                <th className="py-2 pr-4 font-normal">When</th>
                <th className="py-2 pr-4 font-normal">Who</th>
                <th className="py-2 pr-4 font-normal">What</th>
                <th className="py-2 pr-4 font-normal">Applicant hash</th>
                <th className="py-2 font-normal">Detail</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-brand-black/10 align-top text-brand-black/80"
                >
                  <td className="whitespace-nowrap py-2 pr-4">
                    {entry.at.toLocaleString("en-GB", { timeZone: "UTC" })}
                  </td>
                  <td className="break-all py-2 pr-4">{entry.actorEmail}</td>
                  <td className="py-2 pr-4">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </td>
                  <td className="py-2 pr-4">
                    {entry.subjectEmailHash ? (
                      <code title={entry.subjectEmailHash}>
                        {entry.subjectEmailHash.slice(0, 12)}…
                      </code>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="break-all py-2">
                    {entry.detail ? (
                      <code>{JSON.stringify(entry.detail)}</code>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
