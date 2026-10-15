import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PageView from "@/cms/PageView";
import { isValidDraft } from "@/cms/drafts";
import { parsePage } from "@/cms/schema";
import { requireCms } from "@/lib/cms-access";
import { loadCmsPage } from "@/lib/cms-pages";
import NoCmsAccess from "../../cms/NoCmsAccess";

// Never indexed: robots.ts disallows /admin, next.config.ts sends X-Robots-Tag on it, and
// this meta tag covers a copy of the HTML seen anywhere else.
export const metadata: Metadata = {
  title: "LAIS - Preview",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The page as its draft would publish it, rendered by the same components as the public page.
 * Opened in its own tab: the site may not be framed.
 */
export default async function CmsPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const actor = await requireCms("edit");
  if (!actor.ok) {
    if (actor.reason === "signed_out") redirect("/admin/login");
    return <NoCmsAccess need="edit" />;
  }
  const { slug } = await params;
  const page = await loadCmsPage(slug);
  if (!page) notFound();

  if (!isValidDraft(slug, page.content)) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
        <h1 className="font-sans text-3xl text-brand-black">This draft is not finished</h1>
        <p className="text-brand-black/80">
          The preview shows once every field is filled in correctly. The editor lists what still needs fixing.
        </p>
        <Link href={`/admin/cms/${slug}`} className="underline">
          Back to the editor
        </Link>
      </main>
    );
  }

  return (
    <>
      <PageView slug={slug} page={parsePage(slug, page.content)} />
      <p
        role="note"
        className="fixed inset-x-0 bottom-0 z-50 bg-brand-red px-4 py-2 text-center font-sans text-brand-white"
      >
        Preview of {page.state === "draft" ? "the draft" : "the live page"}. Visitors do not see this version until it is published.
      </p>
    </>
  );
}
