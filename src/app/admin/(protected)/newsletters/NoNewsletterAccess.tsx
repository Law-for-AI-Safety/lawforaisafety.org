import Link from "next/link";

/** Shown in place of a newsletter page to a signed-in admin without permission to write one. */
export default function NoNewsletterAccess() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
      <h1 className="font-sans text-3xl text-brand-black">No access to the newsletter</h1>
      <p className="text-brand-black/80">
        Writing the newsletter needs permission to edit website pages, and sending it needs permission to publish them. A
        technical admin can give either in Settings.
      </p>
      <Link href="/admin" className="underline">
        Back to admin
      </Link>
    </main>
  );
}
