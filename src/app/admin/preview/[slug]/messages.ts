/**
 * The messages between the editor and the preview it frames. Both are pages of this site, so
 * each side accepts a message only from its own origin and from the window it expects.
 */
export type PreviewMessage =
  /** The framed preview is listening, and wants the editor's draft. */
  | { type: "cms-preview-ready"; slug: string }
  /** The editor's draft as it stands, saved or not, and whether to mark changed blocks. */
  | { type: "cms-preview-draft"; slug: string; content: unknown; showChanges: boolean }
  /** The editor is on this block's fields: the preview scrolls to the block. */
  | { type: "cms-preview-show"; slug: string; index: number }
  /** A block was clicked in the preview: the editor opens its fields. */
  | { type: "cms-preview-select"; slug: string; index: number };

export function readPreviewMessage(event: MessageEvent, from: MessageEventSource | null, slug: string): PreviewMessage | null {
  if (event.origin !== window.location.origin || from === null || event.source !== from) return null;
  const data = event.data as Partial<Record<string, unknown>> | null;
  if (typeof data !== "object" || data === null || data.slug !== slug) return null;
  switch (data.type) {
    case "cms-preview-ready":
      return data as PreviewMessage;
    case "cms-preview-draft":
      return typeof data.showChanges === "boolean" ? (data as PreviewMessage) : null;
    case "cms-preview-show":
    case "cms-preview-select":
      return Number.isInteger(data.index) ? (data as PreviewMessage) : null;
    default:
      return null;
  }
}
