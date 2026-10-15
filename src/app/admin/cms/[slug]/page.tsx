import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cmsCan } from "@/cms/access";
import { requireCms } from "@/lib/cms-access";
import { checkPage, cmsImages, loadCmsPage } from "@/lib/cms-pages";
import { discardDraft, publishDraft, saveDraft } from "../actions";
import NoCmsAccess from "../NoCmsAccess";
import PageEditor from "./PageEditor";

export const metadata: Metadata = {
  title: "LAIS - Edit page",
  robots: { index: false, follow: false },
};

export default async function CmsEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const actor = await requireCms("edit");
  if (!actor.ok) {
    if (actor.reason === "signed_out") redirect("/admin/login");
    return <NoCmsAccess need="edit" />;
  }
  const { slug } = await params;
  const page = await loadCmsPage(slug);
  if (!page) notFound();

  return (
    <PageEditor
      slug={slug}
      initialContent={page.content}
      initialVersion={page.version}
      initialState={page.state}
      initialProblems={checkPage(slug, page.content)}
      baseChanged={page.draft !== null && page.draft.baseHash !== page.file.hash}
      canPublish={cmsCan(actor.access, "publish")}
      images={cmsImages()}
      save={saveDraft}
      discard={discardDraft}
      publish={publishDraft}
    />
  );
}
