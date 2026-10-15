import Link from "next/link";

/** Shown in place of a CMS page to a signed-in admin without the permission it needs. */
export default function NoCmsAccess({ need }: { need: "edit" | "publish" }) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
      <h1 className="font-sans text-3xl text-brand-black">No access to website pages</h1>
      <p className="text-brand-black/80">
        {need === "edit"
          ? "You have not been given permission to edit the website's pages. A technical admin can give it to you in Settings."
          : "You do not have permission to publish pages."}
      </p>
      <Link href="/admin" className="underline">
        Back to admin
      </Link>
    </main>
  );
}
