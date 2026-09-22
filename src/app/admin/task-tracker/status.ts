export const TASK_TRACKER_STATUSES = [
  "draft",
  "ready",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
] as const;

export type TaskTrackerStatus = (typeof TASK_TRACKER_STATUSES)[number];

export const STATUS_LABELS: Record<TaskTrackerStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export const STATUS_BADGE_CLASSES: Record<TaskTrackerStatus, string> = {
  draft: "border-brand-black/30 text-brand-black/70",
  ready: "border-brand-navy text-brand-navy",
  in_progress: "border-brand-navy bg-brand-navy/5 text-brand-navy",
  blocked: "border-brand-red bg-brand-red/10 text-brand-red",
  done: "border-brand-black/30 bg-brand-black/5 text-brand-black/70",
  // /70 not lower: anything under ~/65 on brand-white drops below 4.5:1.
  cancelled: "border-brand-black/20 text-brand-black/70 line-through",
};
