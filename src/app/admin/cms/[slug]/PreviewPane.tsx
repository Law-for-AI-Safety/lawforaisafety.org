"use client";

import { useEffect, useRef, useState } from "react";
import { readPreviewMessage, type PreviewMessage } from "../../preview/[slug]/messages";
import { usePreviewSettings } from "./preview-settings";

/** The window width each view lays the page out at; the frame is scaled down to fit the pane. */
const VIEW_WIDTH = { desktop: 1280, mobile: 390 } as const;

type Props = {
  slug: string;
  page: unknown;
  /** The block whose fields are being edited, which the preview scrolls to. */
  editing: number | null;
  /** Called with a block clicked in the preview. */
  onSelect: (index: number) => void;
  className?: string;
};

/**
 * The preview page, framed beside the editor's fields. The frame is given a real window width,
 * so the page's own breakpoints apply, and it is sent the draft on every change, saved or not.
 */
export default function PreviewPane({ slug, page, editing, onSelect, className = "" }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [{ view, changes }, setSettings] = usePreviewSettings();
  const [box, setBox] = useState({ width: 0, height: 0 });
  // Counts the times the frame said it was ready: it says so again after a reload.
  const [ready, setReady] = useState(0);
  const select = useRef(onSelect);
  useEffect(() => {
    select.current = onSelect;
  });

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const message = readPreviewMessage(event, frameRef.current?.contentWindow ?? null, slug);
      if (message?.type === "cms-preview-ready") setReady((n) => n + 1);
      if (message?.type === "cms-preview-select") select.current(message.index);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [slug]);

  const send = (message: PreviewMessage) => frameRef.current?.contentWindow?.postMessage(message, window.location.origin);

  useEffect(() => {
    if (ready > 0) send({ type: "cms-preview-draft", slug, content: page, showChanges: changes });
  }, [ready, slug, page, changes]);

  useEffect(() => {
    if (ready > 0 && editing !== null) send({ type: "cms-preview-show", slug, index: editing });
  }, [ready, slug, editing]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const width = VIEW_WIDTH[view];
  const scale = box.width > 0 ? Math.min(1, box.width / width) : 1;

  return (
    <aside aria-label="Preview" className={`min-h-[70dvh] flex-1 flex-col border-brand-black/15 lg:min-h-0 lg:min-w-0 lg:border-l ${className}`}>
      <div className="flex flex-wrap items-center gap-3 border-b border-brand-black/15 px-4 py-2 text-sm">
        <span className="text-brand-black/70">Preview</span>
        {(["desktop", "mobile"] as const).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setSettings({ view: v })} className="rounded-sm border border-brand-black/30 px-2 py-0.5 aria-pressed:bg-brand-black aria-pressed:text-brand-white">
            {v === "desktop" ? "Desktop" : "Mobile"}
          </button>
        ))}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={changes} onChange={(e) => setSettings({ changes: e.target.checked })} />
          Mark changes since the live page
        </label>
      </div>
      <div ref={boxRef} className="flex flex-1 justify-center overflow-hidden bg-brand-black/5">
        <div style={{ width: width * scale }}>
          <iframe
            ref={frameRef}
            src={`/admin/preview/${slug}`}
            title={`Preview of /${slug}`}
            className="origin-top-left border-0 bg-brand-white"
            style={{ width, height: box.height / scale, transform: `scale(${scale})` }}
          />
        </div>
      </div>
    </aside>
  );
}
