"use client";

import { useEffect, useRef, useState } from "react";

const SHAPE_PATH =
  "M 65,28 L 81.13,31.713 C 85.639,36.203 90.246,40.636 95.116,44.719 C 120.302,65.44 152.695,76.716 185.041,78.987 C 186.376,78.922 191.093,78.782 192.639,78.71 L 195.592,78.602 L 196.33,78.575 C 196.3,78.568 196.952,78.535 197.348,78.739 C 197.772,78.924 198.121,79.243 198.339,79.64 C 198.548,79.901 198.631,80.616 198.587,80.865 C 197.144,98.936 195.324,117.187 190.423,134.716 C 172.396,202.914 120.992,261.329 65.764,303.233 L 65,305 Z";

/**
 * Button counterpart to WipeButton (which renders an `<a>`) — same wipe-hover
 * animation, but a real `<button>` so it works as a form submit control
 * (including `formAction` to route a single form to different endpoints).
 */
export default function WipeSubmitButton({
  type = "button",
  formAction,
  disabled,
  onClick,
  className,
  hoverBg,
  children,
}: {
  type?: "button" | "submit";
  formAction?: string;
  disabled?: boolean;
  onClick?: () => void;
  className: string;
  hoverBg: string;
  children: React.ReactNode;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const shapeRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ b: 0, w: 0 });

  useEffect(() => {
    const btn = btnRef.current;
    const shape = shapeRef.current;
    if (!btn || !shape) return;

    const measure = () =>
      setDims({ b: btn.offsetWidth, w: shape.offsetWidth });

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(btn);
    ro.observe(shape);
    return () => ro.disconnect();
  }, []);

  const total = dims.b + dims.w;
  const fillDelayFrac = total > 0 ? dims.w / total : 0;
  const fillDurationFrac = total > 0 ? dims.b / total : 1;

  return (
    <button
      ref={btnRef}
      type={type}
      formAction={formAction}
      disabled={disabled}
      onClick={onClick}
      className={`btn-wipe ${className}`}
      style={
        {
          "--wipe-hover-bg": hoverBg,
          "--wipe-shape-w": `${dims.w}px`,
          "--wipe-btn-w": `${dims.b}px`,
          "--wipe-fill-delay-frac": fillDelayFrac,
          "--wipe-fill-duration-frac": fillDurationFrac,
        } as React.CSSProperties
      }
    >
      {children}
      <span className="wipe-fill" aria-hidden />
      <span className="wipe-shape-wrap" aria-hidden>
        <div ref={shapeRef} className="wipe-shape">
          <svg className="wipe-svg" viewBox="65 28 134 277">
            <path d={SHAPE_PATH} />
          </svg>
        </div>
      </span>
    </button>
  );
}
