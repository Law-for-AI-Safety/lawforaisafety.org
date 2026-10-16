"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { FormPreview } from "@/app/apply/form-preview";
import PageView from "@/cms/PageView";
import { previewBlocks, type PreviewBlock } from "@/cms/preview";
import type { BlockContent } from "@/cms/schema";
import { readPreviewMessage, type PreviewMessage } from "./messages";

// Whether the page is framed never changes while it is open.
const noChange = () => () => {};

type Props = {
  slug: string;
  /** The saved content's blocks, as the preview shows them. */
  initial: PreviewBlock[];
  /** The live page's blocks, which changed blocks are told apart from. */
  live: BlockContent[];
  /** What the saved content is: the draft, or the live page when there is no draft. */
  of: "the draft" | "the live page";
};

type Shown = PreviewBlock & { shown: BlockContent };
const isShown = (block: PreviewBlock): block is Shown => block.shown !== null;

/**
 * The page as its draft would publish it. Opened in its own tab it shows the saved draft. Framed
 * by the editor it follows the editor's unsaved changes, scrolls to the block being edited, and
 * tells the editor which block was clicked. A block that is not finished is outlined in red and
 * keeps its last finished version, or shows as a gap when it has none.
 */
export default function LivePreview({ slug, initial, live, of }: Props) {
  const [blocks, setBlocks] = useState(initial);
  const [shown, setShown] = useState(of);
  const [showChanges, setShowChanges] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
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
      if (message?.type === "cms-preview-draft") {
        setBlocks((before) => previewBlocks(message.content, before.map((b) => b.shown), live));
        setShown("the draft");
        setShowChanges(message.showChanges);
      } else if (message?.type === "cms-preview-show") {
        setSelected(message.index);
        document.querySelector(`[data-block="${message.index}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    window.addEventListener("message", receive);
    parent.postMessage({ type: "cms-preview-ready", slug } satisfies PreviewMessage, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, [slug, live]);

  // A framed preview opens links in a new tab: the site's other pages may not be framed.
  const openLinksOutside = (event: MouseEvent) => {
    const link = (event.target as Element).closest("a[href]");
    const href = link?.getAttribute("href");
    if (!framed || !href || href.startsWith("#")) return;
    event.preventDefault();
    window.open(href, "_blank", "noopener");
  };

  const select = (index: number) => {
    if (!framed) return;
    setSelected(index);
    window.parent.postMessage({ type: "cms-preview-select", slug, index } satisfies PreviewMessage, window.location.origin);
  };

  const rendered = blocks.filter(isShown);
  if (rendered.length === 0) {
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

  const gap = (block: PreviewBlock) => (
    <div key={`gap-${block.index}`} data-block={block.index} onClick={() => select(block.index)} className={`scroll-mt-28 px-4 py-6 font-sans ${framed ? "cursor-pointer" : ""}`}>
      <div className="mx-auto max-w-3xl border-2 border-dashed border-brand-red px-4 py-3 text-brand-black">
        <p>
          Block {block.index + 1} ({block.label}) is not finished, so it is not shown yet.
        </p>
        <Problems problems={block.problems} />
      </div>
    </div>
  );

  const frame = (i: number, node: ReactNode) => {
    const block = rendered[i];
    const before = blocks.slice(i === 0 ? 0 : rendered[i - 1].index + 1, block.index);
    const after = i === rendered.length - 1 ? blocks.slice(block.index + 1) : [];
    const unfinished = block.problems.length > 0;
    const outline = unfinished ? "outline-4 -outline-offset-4 outline-brand-red" : selected === block.index ? "outline-4 -outline-offset-4 outline-brand-navy" : "";
    return (
      <>
        {before.map(gap)}
        <div
          data-block={block.index}
          onClick={() => select(block.index)}
          className={`relative scroll-mt-28 ${outline} ${framed ? "cursor-pointer hover:outline-2 hover:-outline-offset-2 hover:outline-brand-navy/40" : ""}`}
        >
          {node}
          {(unfinished || (showChanges && block.changed)) && (
            <div className="absolute bottom-3 left-3 z-10 flex max-w-lg flex-col items-start gap-1 font-sans text-base">
              {showChanges && block.changed && <span className="rounded-sm bg-brand-navy px-2 py-0.5 text-brand-white">Changed</span>}
              {unfinished && (
                <div className="rounded-sm bg-brand-red px-3 py-2 text-brand-white">
                  <p>Not finished: showing its last finished version.</p>
                  <Problems problems={block.problems} />
                </div>
              )}
            </div>
          )}
        </div>
        {after.map(gap)}
      </>
    );
  };

  const anyUnfinished = blocks.some((b) => b.problems.length > 0);
  return (
    <div onClickCapture={openLinksOutside}>
      <FormPreview>
        <PageView slug={slug} page={{ blocks: rendered.map((b) => b.shown) }} renderBlock={frame} />
      </FormPreview>
      <p role="note" className="fixed inset-x-0 bottom-0 z-50 bg-brand-red px-4 py-2 text-center font-sans text-brand-white">
        Preview of {shown}. {anyUnfinished ? "Blocks that are not finished are outlined in red." : "Visitors do not see this version until it is published."}
      </p>
    </div>
  );
}

function Problems({ problems }: { problems: string[] }) {
  return (
    <ul className="list-disc pl-5">
      {problems.map((p, i) => (
        <li key={i}>{p}</li>
      ))}
    </ul>
  );
}
