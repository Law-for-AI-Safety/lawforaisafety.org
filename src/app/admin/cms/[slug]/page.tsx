import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cmsCan } from "@/cms/access";
import { requireCms } from "@/lib/cms-access";
import { checkPage, cmsImages, loadCmsPage } from "@/lib/cms-pages";
import { cmsGitHub, publishingView, refreshPublishing } from "@/lib/cms-publishing";
import { latestSubmission } from "@/lib/cms-store";
import { discardDraft, publishDraft, saveDraft, withdrawPublish } from "../actions";
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
  const before = await loadCmsPage(slug);
  if (!before) notFound();
  // The page's publishing status is read from GitHub here, on load, and nowhere else.
  const { checked } = await refreshPublishing(slug, before.file.hash, actor.email);
  const page = (await loadCmsPage(slug)) ?? before;
  const publishing = publishingView(page, await latestSubmission(slug));

  return (
    <PageEditor
      slug={slug}
      initialContent={page.content}
      initialVersion={page.version}
      initialState={publishing.state}
      initialProblems={checkPage(slug, page.content)}
      baseChanged={page.draft !== null && page.draft.baseHash !== page.file.hash}
      canPublish={cmsCan(actor.access, "publish")}
      publishSetUp={cmsGitHub() !== null}
      publishing={publishing}
      statusChecked={checked}
      images={cmsImages()}
      save={saveDraft}
      discard={discardDraft}
      publish={publishDraft}
      withdraw={withdrawPublish}
    />
  );
}
