import { DARK_BAND, type DarkTone } from "../bands";
import { InlineText } from "../render";
import Rule from "./Rule";
import type { BlockOf } from "./types";

export default function QuoteBand({ block, tone }: { block: BlockOf<"quoteBand">; tone: DarkTone }) {
  return (
    <section className={`${DARK_BAND[tone]} px-8 md:px-16 py-24 md:py-32`}>
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <Rule />
        <blockquote
          className="text-3xl md:text-5xl font-light text-brand-white leading-tight max-w-2xl"
          style={{ textWrap: "balance" }}
        >
          <InlineText value={block.quote} />
        </blockquote>
      </div>
    </section>
  );
}
