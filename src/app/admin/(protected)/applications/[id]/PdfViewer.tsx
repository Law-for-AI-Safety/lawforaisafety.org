"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders the CV as a sandboxed in-browser canvas via pdfjs-dist, rather than
 * an <iframe>/native PDF plugin — the reviewer never opens the file with a
 * native reader, which is the main attack surface for a malicious PDF.
 */
export default function PdfViewer({ src }: { src: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const response = await fetch(src, { credentials: "same-origin" });
        if (!response.ok) throw new Error("Failed to load CV");
        const data = await response.arrayBuffer();

        const pdfDocument = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;
        setPageCount(pdfDocument.numPages);

        const page = await pdfDocument.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 1.4 });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) return;

        await page.render({ canvas, canvasContext: context, viewport }).promise;
      } catch {
        if (!cancelled) setError("Could not render CV");
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [src, pageNumber]);

  if (error) {
    return <p className="text-brand-red">{error}</p>;
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas ref={canvasRef} className="border border-brand-black/20" />
      {pageCount && pageCount > 1 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((n) => n - 1)}
            className="disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {pageNumber} of {pageCount}
          </span>
          <button
            type="button"
            disabled={pageNumber >= pageCount}
            onClick={() => setPageNumber((n) => n + 1)}
            className="disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
