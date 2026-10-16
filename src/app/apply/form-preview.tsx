"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Marks the forms inside it as a preview: they render as on the live page, but cannot be
 * submitted. The CMS draft preview wraps the page in it, so nobody sends a real application
 * from a page that is not published.
 */
const FormPreviewContext = createContext(false);

export function FormPreview({ children }: { children: ReactNode }) {
  return <FormPreviewContext value={true}>{children}</FormPreviewContext>;
}

export function useFormPreview(): boolean {
  return useContext(FormPreviewContext);
}

/** The note a previewed form shows; nothing on a live page. */
export function FormPreviewNote() {
  return useFormPreview() ? <p className="text-sm text-brand-black/60">Preview: form disabled</p> : null;
}
