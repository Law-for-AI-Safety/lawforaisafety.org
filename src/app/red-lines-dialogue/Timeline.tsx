import LocalTime from "./LocalTime";
import RingBullet from "../RingBullet";
import TimelineRail from "../TimelineRail";

type TimelineItem = {
  date: string;
  time?: string;
  utc?: string;
  detail: string;
};

function TentativeRing() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden fill="none">
      <circle
        cx="10"
        cy="10"
        r="8"
        stroke="#9b1c1f"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
    </svg>
  );
}

export default function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="relative flex flex-col pl-10">
      <TimelineRail className="left-0 -top-6 -bottom-6" />

      {items.map((item) => (
        <div
          key={item.date}
          className="relative grid grid-cols-1 md:grid-cols-[220px_1fr] gap-2 md:gap-8 py-6 border-t border-brand-black/10 last:border-b"
        >
          <span className="absolute -left-11 top-7 rounded-full bg-brand-white">
            {item.time === "tentative" ? (
              <TentativeRing />
            ) : (
              <RingBullet size={20} />
            )}
          </span>
          <div className="flex flex-col">
            <span className="text-lg font-medium text-brand-black">
              {item.date}
            </span>
            {item.time && (
              <span className="text-base font-light text-brand-navy/70">
                {item.time}
                {item.utc && <LocalTime utc={item.utc} />}
              </span>
            )}
          </div>
          <p className="text-lg font-light text-brand-navy/85 leading-relaxed">
            {item.detail}
          </p>
        </div>
      ))}
    </div>
  );
}
