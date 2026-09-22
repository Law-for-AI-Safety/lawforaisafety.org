import { STATUS_LABELS, STATUS_BADGE_CLASSES, type TaskTrackerStatus } from "./status";

export default function StatusBadge({ status }: { status: TaskTrackerStatus }) {
  return (
    <span className={`border px-2 py-1 text-xs uppercase ${STATUS_BADGE_CLASSES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
