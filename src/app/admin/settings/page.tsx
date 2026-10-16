import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminAuditLog } from "@/drizzle/schema";
import {
  getAdminSession,
  isAdminEmailAllowed,
  isTechAdminConfigured,
  isTechAdminEmail,
  pinnedAdminSubs,
} from "@/lib/session";
import { getRedLinesFlagState, getSignupFlagState } from "@/lib/feature-flags";
import TechAdminOnly from "../TechAdminOnly";
import { isPolicyServed } from "../../privacy-policy/visibility";
import SignupToggle from "./SignupToggle";
import RedLinesToggle from "./RedLinesToggle";
import CmsRoleSelect from "./CmsRoleSelect";
import { setCmsRole } from "./cms-actions";
import { listPeople } from "@/lib/admin-people";
import { listCmsRoles } from "@/lib/cms-store";

export const metadata: Metadata = {
  title: "LAIS - Settings",
  robots: { index: false, follow: false },
};

/**
 * Runtime switches for the site. Deliberately outside the `(protected)` route
 * group: that layout is a desktop split view (fixed 384px sidebar), and this
 * page needs to be usable from a phone. It does its own session check, and
 * is limited to technical admins (see isTechAdminEmail).
 */

/**
 * Every LinkedIn account each admin has signed in with, newest first — what
 * a technical admin copies into ADMIN_LINKEDIN_SUBS. Read from the audit
 * log's login entries, so it needs no access to the function logs.
 */
async function getAdminLogins() {
  const linkedinSub = sql<string>`${adminAuditLog.detail}->>'linkedinSub'`;
  const lastLoginAt = sql<Date>`max(${adminAuditLog.at})`;
  return db
    .select({
      email: adminAuditLog.actorEmail,
      linkedinSub,
      lastLoginAt,
    })
    .from(adminAuditLog)
    .where(
      and(
        eq(adminAuditLog.action, "login"),
        isNotNull(sql`${adminAuditLog.detail}->>'linkedinSub'`),
      ),
    )
    .groupBy(adminAuditLog.actorEmail, linkedinSub)
    .orderBy(desc(lastLoginAt));
}
export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ signup?: string; redLines?: string }>;
}) {
  // Set by the toggle route's redirect, so the page can say what just happened.
  const { signup: justChanged, redLines: redLinesJustChanged } = await searchParams;

  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  if (!isTechAdminEmail(session.email)) {
    return <TechAdminOnly configured={isTechAdminConfigured()} />;
  }

  const flag = await getSignupFlagState();
  const enabled = flag?.enabled ?? false;
  const redLinesFlag = await getRedLinesFlagState();
  const redLinesEnabled = redLinesFlag?.enabled ?? false;
  const logins = await getAdminLogins();
  const pinned = pinnedAdminSubs();
  const cmsRoles = new Map((await listCmsRoles()).map((r) => [r.email, r.permission]));
  // Everyone who has logged in, plus anyone holding a CMS role who has not (so it can be removed).
  const known = await listPeople();
  const people = [
    ...known,
    ...[...cmsRoles.keys()].filter((email) => !known.some((p) => p.email === email)).map((email) => ({ email, name: email })),
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
      <Link href="/admin" className="text-brand-black/70 underline">
        Back to applications
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="font-sans text-3xl text-brand-black">Settings</h1>
        <p className="text-brand-black/70">Signed in as {session.email}</p>
      </div>

      <section className="flex flex-col gap-4 rounded-sm border border-brand-black/15 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl text-brand-black">Public signup</h2>
          <p className="text-brand-black/70">
            Newsletter signup and the apply-to-work-with-us forms on the
            homepage and project pages. When off, their endpoints refuse
            submissions. Reviewing applications is not affected.
          </p>
          <p className="text-brand-black/70">
            Switching this off is an emergency stop: submissions are refused
            within a minute, but the forms stay visible on the site until the
            pages are changed to hide them.
          </p>
        </div>

        {(justChanged === "on" || justChanged === "off") && (
          <p
            role="status"
            className={`border px-3 py-3 ${
              justChanged === "on"
                ? "border-brand-navy bg-brand-navy/5 text-brand-navy"
                : "border-brand-black/30 bg-brand-black/5 text-brand-black"
            }`}
          >
            {justChanged === "on"
              ? "Done. Signup is now ON: the newsletter and application forms accept submissions."
              : "Done. Signup is now OFF: within a minute the forms' endpoints refuse submissions. The forms stay visible until the pages are changed to hide them."}
          </p>
        )}

        <p className="text-lg text-brand-black">
          Currently{" "}
          <strong className={enabled ? "text-brand-navy" : "text-brand-red"}>
            {enabled ? "ON" : "OFF"}
          </strong>
        </p>
        {flag ? (
          <p className="text-sm text-brand-black/60">
            Last changed by {flag.updatedBy ?? "unknown"} on{" "}
            {flag.updatedAt.toLocaleString("en-GB", { timeZone: "UTC" })} UTC
          </p>
        ) : (
          <p className="text-sm text-brand-black/60">
            Never switched on. Signup stays off until you turn it on here.
          </p>
        )}

        <SignupToggle enabled={enabled} policyPublished={isPolicyServed()} />
      </section>

      <section className="flex flex-col gap-4 rounded-sm border border-brand-black/15 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl text-brand-black">Red Lines Dialogues applications</h2>
          <p className="text-brand-black/70">
            The application form on /red-lines-dialogue. When off, its
            endpoints refuse submissions. Reviewing applications is not
            affected.
          </p>
          <p className="text-brand-black/70">
            Switching this off is an emergency stop: submissions are refused
            within a minute, but the form stays visible until the page is
            changed to hide it.
          </p>
        </div>

        {(redLinesJustChanged === "on" || redLinesJustChanged === "off") && (
          <p
            role="status"
            className={`border px-3 py-3 ${
              redLinesJustChanged === "on"
                ? "border-brand-navy bg-brand-navy/5 text-brand-navy"
                : "border-brand-black/30 bg-brand-black/5 text-brand-black"
            }`}
          >
            {redLinesJustChanged === "on"
              ? "Done. Applications are now ON: the form on /red-lines-dialogue accepts submissions."
              : "Done. Applications are now OFF: within a minute its endpoints refuse submissions. The form stays visible until the page is changed to hide it."}
          </p>
        )}

        <p className="text-lg text-brand-black">
          Currently{" "}
          <strong className={redLinesEnabled ? "text-brand-navy" : "text-brand-red"}>
            {redLinesEnabled ? "ON" : "OFF"}
          </strong>
        </p>
        {redLinesFlag ? (
          <p className="text-sm text-brand-black/60">
            Last changed by {redLinesFlag.updatedBy ?? "unknown"} on{" "}
            {redLinesFlag.updatedAt.toLocaleString("en-GB", { timeZone: "UTC" })} UTC
          </p>
        ) : (
          <p className="text-sm text-brand-black/60">
            Never switched on. Applications stay off until you turn them on here.
          </p>
        )}

        <RedLinesToggle enabled={redLinesEnabled} policyPublished={isPolicyServed()} />
      </section>

      <section className="flex flex-col gap-4 rounded-sm border border-brand-black/15 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl text-brand-black">Website editors</h2>
          <p className="text-brand-black/70">
            Who may change the website&apos;s pages. Editing drafts includes
            previewing them; publishing includes editing. Technical admins can
            always do both. People appear here after their first admin login.
          </p>
        </div>

        {people.length === 0 ? (
          <p className="text-brand-black/60">Nobody has logged in yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {people.map((person) => (
              <li
                key={person.email}
                className="flex flex-wrap items-start justify-between gap-2 border-t border-brand-black/10 pt-3"
              >
                <div className="flex flex-col">
                  <span className="text-brand-black">{person.name}</span>
                  <span className="break-all text-sm text-brand-black/60">{person.email}</span>
                  {!isAdminEmailAllowed(person.email) &&
                    (cmsRoles.has(person.email) ? (
                      <span className="text-sm text-brand-red">
                        Inactive (not an admin): this access has no effect until they are in ADMIN_EMAILS.
                      </span>
                    ) : (
                      <span className="text-sm text-brand-black/60">
                        Not in ADMIN_EMAILS, so cannot log in.
                      </span>
                    ))}
                </div>
                {isTechAdminEmail(person.email) ? (
                  <span className="text-sm text-brand-black/70">Technical admin: full access</span>
                ) : (
                  <CmsRoleSelect
                    email={person.email}
                    name={person.name}
                    initial={cmsRoles.get(person.email) ?? "none"}
                    setRole={setCmsRole}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-sm border border-brand-black/15 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl text-brand-black">Admin logins</h2>
          <p className="text-brand-black/70">
            The LinkedIn account each admin has signed in with. To lock admin
            login to these exact accounts, put the ids (comma-separated) in
            the ADMIN_LINKEDIN_SUBS environment variable and redeploy.
          </p>
          <p className="text-sm text-brand-black/60">
            {pinned.length > 0
              ? "Pinning is on: only the accounts marked pinned can log in."
              : "Pinning is off: any LinkedIn account reporting an allowlisted email can log in."}
          </p>
        </div>

        {logins.length === 0 ? (
          <p className="text-brand-black/60">
            No logins recorded yet. Ids appear here after each admin&apos;s
            next login.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {logins.map((login) => (
              <li
                key={`${login.email}:${login.linkedinSub}`}
                className="flex flex-col gap-1 border-t border-brand-black/10 pt-3"
              >
                <span className="break-all text-brand-black">{login.email}</span>
                <code className="break-all text-sm text-brand-black/80">
                  {login.linkedinSub}
                </code>
                <span className="text-sm text-brand-black/60">
                  Last login{" "}
                  {new Date(login.lastLoginAt).toLocaleString("en-GB", {
                    timeZone: "UTC",
                  })}{" "}
                  UTC
                  {pinned.length > 0 &&
                    (pinned.includes(login.linkedinSub)
                      ? " · pinned"
                      : " · not pinned, can no longer log in")}
                </span>
              </li>
            ))}
          </ul>
        )}

        <Link href="/admin/audit" className="underline">
          View audit log
        </Link>
      </section>
    </main>
  );
}
