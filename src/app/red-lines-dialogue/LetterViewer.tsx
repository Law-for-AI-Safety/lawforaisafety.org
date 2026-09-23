"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders a PDF as plain canvases via pdfjs-dist — no browser chrome
 * (toolbar, dark sidebar, zoom controls), just the pages themselves, styled
 * to sit inside the page rather than look like an embedded application.
 * Same approach as the admin CV viewer (PdfViewer.tsx), rendering every page
 * stacked instead of paginated, since this is a short letter meant to be
 * read top to bottom, not a multi-page document to navigate.
 */
export default function LetterViewer({
  src,
  title,
}: {
  src: string;
  title: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageCanvases, setPageCanvases] = useState<HTMLCanvasElement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const response = await fetch(src);
        if (!response.ok) throw new Error("Failed to load letter");
        const data = await response.arrayBuffer();

        const pdfDocument = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;

        // Rendered at 2x for a crisp look on high-DPI screens, then the
        // canvas is styled down to the container's width with CSS — see
        // the `w-full h-auto` class below.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const canvases: HTMLCanvasElement[] = [];

        for (let i = 1; i <= pdfDocument.numPages; i++) {
          const page = await pdfDocument.getPage(i);
          if (cancelled) return;

          const viewport = page.getViewport({ scale: 2 * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "w-full h-auto block";

          const context = canvas.getContext("2d");
          if (!context) continue;
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          if (cancelled) return;
          canvases.push(canvas);
        }

        if (!cancelled) setPageCanvases(canvases);
      } catch {
        if (!cancelled) setError("Could not display the letter inline.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.replaceChildren(...pageCanvases);
  }, [pageCanvases]);

  if (error) {
    return <p className="text-lg font-light text-brand-navy/85">{error}</p>;
  }

  return (
    <div className="rounded-sm border border-brand-black/10 bg-brand-white overflow-hidden shadow-[0_4px_16px_-4px_rgba(22,22,29,0.12)]">
      {loading && (
        <div className="flex items-center justify-center h-[400px]">
          <p className="text-lg font-light text-brand-navy/60">Loading letter…</p>
        </div>
      )}
      <div ref={containerRef} role="img" aria-label={title} className="flex flex-col" />
    </div>
  );
}
