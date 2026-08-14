import type { ReactNode } from "react";
import Nav from "./Nav";

/**
 * Shared shell for standalone (non-homepage) content pages — success/error
 * landings reached via redirect, not the homepage. Mirrors the container
 * shape every homepage section uses (`px-8 md:px-16` on the outer band,
 * `max-w-4xl mx-auto` on an inner content div — see page.tsx), so these
 * pages read as the same site rather than a narrower utility-page width.
 * Nav is `fixed`, so every page using it needs enough top clearance to not
 * render underneath it; `pt-44` was measured against the nav's tallest
 * (unscrolled) rendered height (166.875px) with a small margin, not guessed.
 */
export default function ContentPage({
  children,
  center = false,
  gap = 4,
}: {
  children: ReactNode;
  center?: boolean;
  gap?: 4 | 6;
}) {
  const gapClass = gap === 6 ? "gap-6" : "gap-4";
  return (
    <>
      <Nav />
      <main className="px-8 md:px-16 pt-44 pb-24">
        <div
          className={`mx-auto flex max-w-4xl flex-col ${gapClass} ${center ? "text-center" : ""}`}
        >
          {children}
        </div>
      </main>
    </>
  );
}
