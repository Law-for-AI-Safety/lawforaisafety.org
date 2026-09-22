export const LEGAL_TASK_STATUSES = [
  "draft",
  "ready",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
] as const;

export type LegalTaskStatus = (typeof LEGAL_TASK_STATUSES)[number];

export const STATUS_LABELS: Record<LegalTaskStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export const STATUS_BADGE_CLASSES: Record<LegalTaskStatus, string> = {
  draft: "border-brand-black/30 text-brand-black/70",
  ready: "border-brand-navy text-brand-navy",
  in_progress: "border-brand-navy bg-brand-navy/5 text-brand-navy",
  blocked: "border-brand-red bg-brand-red/10 text-brand-red",
  done: "border-brand-black/30 bg-brand-black/5 text-brand-black/70",
  cancelled: "border-brand-black/20 text-brand-black/40 line-through",
};
