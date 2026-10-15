// Imported by client components (the state badge), so it imports nothing that needs a server.
import type { PageState } from "./drafts";

/**
 * The four states an editor sees for a page, and the rules that give them. The editor never
 * sees the words GitHub or pull request: a pull request is "sent for publishing".
 *
 * - Draft: the page has saved changes that are not public.
 * - Publishing: the changes were sent and wait for approval, or were approved and the site is
 *   still deploying them. The page is locked: saves, discards and publishes are refused.
 * - Live: visitors see the latest; there are no unpublished changes.
 * - Not published: the reviewer declined the last changes sent (closed without merging). The
 *   draft is unlocked and unchanged since; the reviewer's last comment is shown. The next save
 *   makes it a Draft again.
 */

export type EditorState = "draft" | "publishing" | "live" | "not_published";

export const EDITOR_STATE_LABELS: Record<EditorState, string> = {
  draft: "Draft",
  publishing: "Publishing",
  live: "Live",
  not_published: "Not published",
};

export type SubmissionState = "pending" | "failed" | "open" | "merged" | "closed" | "withdrawn";

export type StateInputs = {
  /** Draft versus Live from the draft and the deployed file (`pageState`). */
  pageState: PageState;
  /** Whether the draft is locked because it was sent for publishing. */
  locked: boolean;
  /** The draft's version, or 0 with no draft. */
  draftVersion: number;
  /** The page's latest submission: its state and the draft version it sent. */
  latest: { state: SubmissionState; draftVersion: number } | null;
};

export function editorState({ pageState, locked, draftVersion, latest }: StateInputs): EditorState {
  if (locked) return "publishing";
  if (latest?.state === "closed" && draftVersion > 0 && latest.draftVersion === draftVersion) return "not_published";
  return pageState;
}

/**
 * Whether a merged page is live on this deployment: its content file is no longer the one
 * the draft started from, or is exactly the merged one. Until then the site is still
 * deploying and the page shows as Publishing.
 */
export function isDeployed({ deployedHash, baseHash, mergedHash }: { deployedHash: string; baseHash: string; mergedHash: string | null }): boolean {
  return deployedHash !== baseHash || deployedHash === mergedHash;
}
