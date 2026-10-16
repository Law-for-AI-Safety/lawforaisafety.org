import { InlineText } from "../render";
import Rule from "./Rule";
import type { BlockOf } from "./types";

export default function Hero({ block }: { block: BlockOf<"hero"> }) {
  return (
    <section className="bg-brand-white flex flex-col justify-center px-8 md:px-16 pt-44 pb-20 md:pt-52 md:pb-24">
      <div className="max-w-4xl mx-auto w-full flex flex-col gap-8 max-w-3xl">
        <h1
          className="text-[2.625rem] md:text-[4.125rem] font-light text-brand-black leading-[1.1] tracking-tight"
          style={{ textWrap: "balance" }}
        >
          {block.heading}
        </h1>
        <Rule />
        <p className="text-xl md:text-2xl font-light text-brand-navy/85 leading-relaxed max-w-2xl">
          <InlineText value={block.lede} />
        </p>
      </div>
    </section>
  );
}
