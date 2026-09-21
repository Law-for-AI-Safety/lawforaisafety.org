import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getSignupFlagState } from "@/lib/feature-flags";

/**
 * Runtime switches for the site. Deliberately outside the `(protected)` route
 * group: that layout is a desktop split view (fixed 384px sidebar), and this
 * page needs to be usable from a phone. It does its own session check.
 */
export default async function AdminSettingsPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const flag = await getSignupFlagState();
  const enabled = flag?.enabled ?? false;

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
            Newsletter signup and apply-to-work-with-us on the homepage. When
            off, the forms are hidden and their endpoints refuse requests.
            Reviewing applications is not affected.
          </p>
        </div>

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

        <form action="/api/admin/settings/signup" method="post">
          <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
          <button
            type="submit"
            className={`w-full rounded-sm px-6 py-4 text-lg ${
              enabled
                ? "border border-brand-red text-brand-red"
                : "bg-brand-navy text-brand-white"
            }`}
          >
            {enabled ? "Turn signup off" : "Turn signup on"}
          </button>
        </form>
      </section>
    </main>
  );
}
