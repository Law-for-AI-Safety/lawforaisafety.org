"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type MouseEvent } from "react";
import { FormPreview } from "@/app/apply/form-preview";
import PageView from "@/cms/PageView";
import { pageSchema, type PageContent } from "@/cms/schema";
import { readPreviewMessage, type PreviewMessage } from "./messages";

// Whether the page is framed never changes while it is open.
const noChange = () => () => {};

type Props = {
  slug: string;
  /** The saved content, or null when it is not finished. */
  initial: PageContent | null;
  /** What the saved content is: the draft, or the live page when there is no draft. */
  of: "the draft" | "the live page";
};

/**
 * The page as its draft would publish it. Opened in its own tab it shows the saved draft; framed
 * by the editor it also follows the editor's unsaved changes, keeping the last finished version
 * while the draft has a field that is not valid yet.
 */
export default function LivePreview({ slug, initial, of }: Props) {
  const [page, setPage] = useState(initial);
  const [shown, setShown] = useState(of);
  const [unfinished, setUnfinished] = useState(false);
  const framed = useSyncExternalStore(
    noChange,
    () => window.parent !== window,
    () => false,
  );

  useEffect(() => {
    if (window.parent === window) return;
    const parent = window.parent;
    const receive = (event: MessageEvent) => {
      const message = readPreviewMessage(event, parent, slug);
      if (message?.type !== "cms-preview-draft") return;
      const result = pageSchema(slug).safeParse(message.content);
      setShown("the draft");
      setUnfinished(!result.success);
      if (result.success) setPage(result.data);
    };
    window.addEventListener("message", receive);
    parent.postMessage({ type: "cms-preview-ready", slug } satisfies PreviewMessage, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, [slug]);

  // A framed preview opens links in a new tab: the site's other pages may not be framed.
  const openLinksOutside = (event: MouseEvent) => {
    const link = (event.target as Element).closest("a[href]");
    const href = link?.getAttribute("href");
    if (!framed || !href || href.startsWith("#")) return;
    event.preventDefault();
    window.open(href, "_blank", "noopener");
  };

  if (!page) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
        <h1 className="font-sans text-3xl text-brand-black">This draft is not finished</h1>
        <p className="text-brand-black/80">
          The preview shows once every field is filled in correctly. The editor lists what still needs fixing.
        </p>
        {!framed && (
          <Link href={`/admin/cms/${slug}`} className="underline">
            Back to the editor
          </Link>
        )}
      </main>
    );
  }

  return (
    <div onClickCapture={openLinksOutside}>
      <FormPreview>
        <PageView slug={slug} page={page} />
      </FormPreview>
      <p role="note" className="fixed inset-x-0 bottom-0 z-50 bg-brand-red px-4 py-2 text-center font-sans text-brand-white">
        {unfinished
          ? "Showing the last finished version. The editor lists what still needs fixing."
          : `Preview of ${shown}. Visitors do not see this version until it is published.`}
      </p>
    </div>
  );
}
