import { DARK_BAND, type DarkTone } from "../bands";
import { InlineText, RichTextBlocks } from "../render";
import Photos from "./Photos";
import Rule from "./Rule";
import type { BlockOf } from "./types";

const TEXT = "text-xl md:text-2xl font-light text-brand-white/90 leading-relaxed max-w-2xl";
const LIST_ITEM = "text-xl md:text-2xl font-light text-brand-white/90 leading-relaxed flex gap-3";

/** A large statement in a dark band, with optional paragraphs and photos under it. */
export default function QuoteBand({ block, tone, id }: { block: BlockOf<"quoteBand">; tone: DarkTone; id?: string }) {
  return (
    <section id={id} className={`${DARK_BAND[tone]} px-8 md:px-16 py-24 md:py-32`}>
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <Rule />
        <blockquote
          className="text-3xl md:text-5xl font-light text-brand-white leading-tight max-w-2xl"
          style={{ textWrap: "balance" }}
        >
          <InlineText value={block.quote} />
        </blockquote>
        {block.body && <RichTextBlocks value={block.body} paragraphClassName={TEXT} listItemClassName={LIST_ITEM} />}
        {block.photos && (
          <div className="flex flex-col gap-3 pt-4">
            <Photos photos={block.photos} />
            {block.caption && <p className="text-lg font-light text-brand-white/85">{block.caption}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
