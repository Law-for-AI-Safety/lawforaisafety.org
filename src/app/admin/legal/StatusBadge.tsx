import { STATUS_LABELS, STATUS_BADGE_CLASSES, type LegalTaskStatus } from "./status";

export default function StatusBadge({ status }: { status: LegalTaskStatus }) {
  return (
    <span className={`border px-2 py-1 text-xs uppercase ${STATUS_BADGE_CLASSES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
