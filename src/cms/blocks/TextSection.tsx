import type { LightTone } from "../bands";
import { RichTextBlocks } from "../render";
import LightSection from "./LightSection";
import Photos from "./Photos";
import Rule from "./Rule";
import type { BlockOf } from "./types";

/** Paragraphs and lists under an optional heading, with optional photos after them. */
export default function TextSection({ block, tone, id }: { block: BlockOf<"textSection">; tone: LightTone; id?: string }) {
  return (
    <LightSection tone={tone} id={id}>
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <Rule />
        {block.heading && <h2 className="text-3xl md:text-4xl font-light text-brand-black leading-tight">{block.heading}</h2>}
        <RichTextBlocks
          value={block.body}
          paragraphClassName="text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl"
          listItemClassName="text-lg font-light text-brand-navy/85 leading-relaxed flex gap-3"
        />
        {block.photos && (
          <div className="pt-4">
            <Photos photos={block.photos} />
          </div>
        )}
      </div>
    </LightSection>
  );
}
