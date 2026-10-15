import WipeButton from "../../app/WipeButton";
import LinkedInLogo from "./LinkedInLogo";

export type ButtonLink = { label: string; href: string };

const FILLED = "inline-flex items-center gap-3 px-8 py-4 bg-brand-red text-brand-white text-lg font-light rounded-sm overflow-hidden";
const OUTLINED = "px-8 py-4 border border-brand-black/30 text-brand-black text-lg font-light rounded-sm overflow-hidden";

function isLinkedIn(href: string): boolean {
  return /^https:\/\/(www\.)?linkedin\.com\//.test(href);
}

/**
 * Link buttons in a row. The design is fixed, not chosen: the last button is filled red and
 * any before it are outlined, and a LinkedIn link carries the LinkedIn logo.
 */
export default function Buttons({ buttons }: { buttons: ButtonLink[] }) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 pt-4">
      {buttons.map((button, i) => {
        const filled = i === buttons.length - 1;
        return (
          <WipeButton
            key={i}
            href={button.href}
            className={filled ? FILLED : OUTLINED}
            hoverBg={filled ? "rgba(255,255,255,0.15)" : "rgba(27,51,76,0.07)"}
          >
            {isLinkedIn(button.href) && <LinkedInLogo />}
            {button.label}
          </WipeButton>
        );
      })}
    </div>
  );
}
