import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { previewBlocks } from "@/cms/preview";
import { pageSchema } from "@/cms/schema";
import { requireCms } from "@/lib/cms-access";
import { loadCmsPage } from "@/lib/cms-pages";
import NoCmsAccess from "../../cms/NoCmsAccess";
import LivePreview from "./LivePreview";

// Never indexed: robots.ts disallows /admin, next.config.ts sends X-Robots-Tag on it, and
// this meta tag covers a copy of the HTML seen anywhere else.
export const metadata: Metadata = {
  title: "LAIS - Preview",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The page as its draft would publish it, rendered by the same components as the public page.
 * The editor frames it beside its fields (the only page of the site that may be framed, and
 * only by the site itself); it also opens in its own tab.
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

  const file = pageSchema(slug).safeParse(JSON.parse(page.file.text));
  const live = file.success ? file.data.blocks : [];
  return (
    <LivePreview
      slug={slug}
      initial={previewBlocks(page.content, [], live)}
      live={live}
      of={page.state === "draft" ? "the draft" : "the live page"}
    />
  );
}
