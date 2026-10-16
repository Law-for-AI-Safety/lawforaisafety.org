import Link from "next/link";

/** The website editor's frame. Each page checks the visitor's permission itself. */
export default function CmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-brand-black/10 px-4 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/admin/cms" className="font-sans text-xl text-brand-black">
            Website pages
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/admin" className="underline">
            Back to admin
          </Link>
          <form action="/api/admin/logout" method="post">
            <button type="submit" className="underline">
              Log out
            </button>
          </form>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
