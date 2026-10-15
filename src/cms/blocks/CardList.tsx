import RingBullet from "../../app/RingBullet";
import type { LightTone } from "../bands";
import { InlineText } from "../render";
import LightSection from "./LightSection";
import Rule from "./Rule";
import type { BlockOf } from "./types";

export default function CardList({ block, tone, id }: { block: BlockOf<"cardList">; tone: LightTone; id?: string }) {
  if (block.style === "numbered") {
    return (
      <LightSection tone={tone} id={id}>
        <div className="max-w-4xl mx-auto flex flex-col gap-10">
          {block.items.map((item, i) => (
            <div key={i} className="flex gap-6 pt-8 border-t border-brand-black/10 first:pt-0 first:border-t-0">
              <span className="text-6xl md:text-8xl font-light leading-[0.8] [font-variant-numeric:lining-nums] text-brand-red/30 flex-shrink-0 w-12 md:w-24 pt-1">
                {i + 1}
              </span>
              <div className="flex flex-col gap-2">
                <h3 className="text-xl md:text-2xl font-light text-brand-black">{item.title}</h3>
                <p className="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl">
                  <InlineText value={item.body} />
                </p>
              </div>
            </div>
          ))}
        </div>
      </LightSection>
    );
  }
  return (
    <LightSection tone={tone} id={id}>
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <Rule />
        <h2 className="text-3xl md:text-4xl font-light text-brand-black leading-tight">{block.heading}</h2>
        <ul className="flex flex-col gap-6 mt-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex-shrink-0 pt-1.5">
                <RingBullet size={16} />
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-lg font-medium text-brand-black">{item.title}</span>
                <span className="text-lg font-light text-brand-navy/85 leading-relaxed">
                  <InlineText value={item.body} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </LightSection>
  );
}
