/**
 * The messages between the editor and the preview it frames. Both are pages of this site, so
 * each side accepts a message only from its own origin and from the window it expects.
 */
export type PreviewMessage =
  /** The framed preview is listening, and wants the editor's draft. */
  | { type: "cms-preview-ready"; slug: string }
  /** The editor's draft as it stands, saved or not. */
  | { type: "cms-preview-draft"; slug: string; content: unknown };

export function readPreviewMessage(event: MessageEvent, from: MessageEventSource | null, slug: string): PreviewMessage | null {
  if (event.origin !== window.location.origin || from === null || event.source !== from) return null;
  const data = event.data as Partial<PreviewMessage> | null;
  if (typeof data !== "object" || data === null || data.slug !== slug) return null;
  if (data.type === "cms-preview-ready" || data.type === "cms-preview-draft") return data as PreviewMessage;
  return null;
}
