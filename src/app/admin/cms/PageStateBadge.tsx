import { EDITOR_STATE_LABELS, type EditorState } from "@/cms/publish-status";

const TONE: Record<EditorState, string> = {
  draft: "border-brand-red text-brand-red",
  publishing: "border-brand-navy bg-brand-navy text-brand-white",
  live: "border-brand-navy text-brand-navy",
  not_published: "border-brand-red bg-brand-red/10 text-brand-red",
};

/**
 * Draft: saved changes that are not public. Publishing: sent, waiting for approval or for the
 * site to update. Live: what visitors see is the latest. Not published: the last changes sent
 * were declined.
 */
export default function PageStateBadge({ state }: { state: EditorState }) {
  return <span className={`rounded-sm border px-2 py-0.5 text-sm ${TONE[state]}`}>{EDITOR_STATE_LABELS[state]}</span>;
}
