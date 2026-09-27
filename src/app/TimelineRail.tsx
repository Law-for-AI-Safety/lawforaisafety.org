// A brush-stroke rail: fixed-length tapered tips at each end joined by a
// solid-width body, so the taper looks the same however tall the timeline is
// (stretching one path made the tips hairline-thin over hundreds of pixels).
// A faint track sits behind a fill that draws in as the timeline scrolls past
// (see .rail-fill in globals.css).
//
// Each tip edge stays near the centre line for the first half, then flares out
// to the body width, so it reads as a sharp brush point. Callers extend the
// rail one tip-length past the first and last dot.
const TIP_HEIGHT = 64;
// Left edge 3, right edge 7 in a 12-wide box: a 4px stroke centred on x=5.
const TIP_PATH = `M5 0 C5 26 3 46 3 ${TIP_HEIGHT} L7 ${TIP_HEIGHT} C7 46 5 26 5 0Z`;

function Tip({ flip }: { flip?: boolean }) {
  return (
    <svg
      viewBox={`0 0 12 ${TIP_HEIGHT}`}
      width="12"
      height={TIP_HEIGHT}
      className={`block flex-none ${flip ? "-scale-y-100" : ""}`}
    >
      <path d={TIP_PATH} fill="#9b1c1f" />
    </svg>
  );
}

function Stroke({ className }: { className?: string }) {
  return (
    <div className={`absolute inset-0 flex flex-col ${className ?? ""}`}>
      <Tip />
      <div className="flex-1 ml-[3px] w-1 bg-brand-red" />
      <Tip flip />
    </div>
  );
}

// `className` positions and sizes the rail inside a `relative` parent.
export default function TimelineRail({ className }: { className?: string }) {
  return (
    <div aria-hidden className={`absolute w-3 ${className ?? ""}`}>
      <Stroke className="opacity-15" />
      <Stroke className="rail-fill" />
    </div>
  );
}
