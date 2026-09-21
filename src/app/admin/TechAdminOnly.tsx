import Link from "next/link";

/**
 * Shown in place of a technical-admin page to a signed-in reviewer. Says
 * which of the two situations it is, because "nobody has been set up yet"
 * needs a different fix from "you're not one of them".
 */
export default function TechAdminOnly({ configured }: { configured: boolean }) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
      <h1 className="font-sans text-3xl text-brand-black">
        Technical admins only
      </h1>
      <p className="text-brand-black/80">
        {configured
          ? "This page is limited to technical admins. If you need something done here, ask one of them."
          : "No technical admins have been set up yet, so this page is closed to everyone. Set TECH_ADMIN_EMAILS in the site's environment variables and redeploy."}
      </p>
      <Link href="/admin" className="underline">
        Back to applications
      </Link>
    </main>
  );
}
