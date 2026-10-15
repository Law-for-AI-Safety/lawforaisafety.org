import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCms } from "@/lib/cms-access";
import { listCmsPages } from "@/lib/cms-pages";
import { pagePath } from "@/cms/pages";
import NoCmsAccess from "./NoCmsAccess";
import PageStateBadge from "./PageStateBadge";

export const metadata: Metadata = {
  title: "LAIS - Website pages",
  robots: { index: false, follow: false },
};

/** Every page editors can change, with whether it has unpublished changes. */
export default async function CmsPagesPage() {
  const actor = await requireCms("edit");
  if (!actor.ok) {
    if (actor.reason === "signed_out") redirect("/admin/login");
    return <NoCmsAccess need="edit" />;
  }
  const pages = await listCmsPages();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-sans text-3xl text-brand-black">Website pages</h1>
        <p className="text-brand-black/70">
          Changes are saved as a draft as you type. Nothing reaches the public site until the page is published.
        </p>
      </div>
      <ul className="flex flex-col">
        {pages.map((page) => (
          <li key={page.slug} className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-black/10 py-4">
            <div className="flex flex-col">
              <Link href={`/admin/cms/${page.slug}`} className="text-lg text-brand-black underline">
                {page.title}
              </Link>
              <span className="text-sm text-brand-black/60">{pagePath(page.slug)}</span>
              {page.draft && (
                <span className="text-sm text-brand-black/60">
                  Last edited by {page.draft.authorEmail} on{" "}
                  {page.draft.updatedAt.toLocaleString("en-GB", { timeZone: "UTC" })} UTC
                  {page.draft.valid ? "" : " · not finished"}
                </span>
              )}
            </div>
            <PageStateBadge state={page.state} />
          </li>
        ))}
      </ul>
    </main>
  );
}
