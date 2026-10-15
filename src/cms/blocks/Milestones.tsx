import RingBullet from "../../app/RingBullet";
import TimelineRail from "../../app/TimelineRail";
import type { LightTone } from "../bands";
import { RichTextBlocks } from "../render";
import Buttons from "./Buttons";
import LightSection from "./LightSection";
import Photos from "./Photos";
import Rule from "./Rule";
import type { BlockOf } from "./types";

type Entry = BlockOf<"milestones">["entries"][number];

const TEXT = "text-lg font-light text-brand-navy/85 leading-relaxed max-w-2xl";
const LIST_ITEM = "text-lg font-light text-brand-navy/85 leading-relaxed flex gap-3";

function Milestone({ entry }: { entry: Entry }) {
  return (
    <div className="flex gap-8">
      <div className="relative flex-shrink-0 w-5 h-9 flex items-center justify-center">
        <span className="flex rounded-full bg-brand-white">
          <RingBullet />
        </span>
      </div>
      <div className="flex flex-col gap-3 min-w-0">
        <h3 className="text-3xl font-light text-brand-black leading-snug max-w-xl">{entry.title}</h3>
        <RichTextBlocks value={entry.body} paragraphClassName={TEXT} listItemClassName={LIST_ITEM} />
        {entry.photos && <Photos photos={entry.photos} />}
        {entry.buttons && <Buttons buttons={entry.buttons} />}
      </div>
    </div>
  );
}

/**
 * Titled events along the red brush rail, each with text and optional photos and buttons.
 * The rail runs from one tip above the first ring to one tip below the last: it is sized to
 * every entry but the last (gap-14 = 56px), plus one gap, the last ring's 18px and both
 * 64px tips, less the 46px it starts above the first entry.
 */
export default function Milestones({ block, tone, id }: { block: BlockOf<"milestones">; tone: LightTone; id?: string }) {
  const entries = block.entries;
  const last = entries[entries.length - 1];
  return (
    <LightSection tone={tone} id={id}>
      <div className="max-w-4xl mx-auto flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          <Rule />
          {/* Halfway between the light sections' heading and the homepage's original one. */}
          <h2 className="text-[2.0625rem] md:text-[2.625rem] font-light text-brand-black leading-tight">{block.heading}</h2>
        </div>
        <div className="flex flex-col gap-14">
          {entries.length > 1 && (
            <div className="relative flex flex-col gap-14">
              <TimelineRail className="left-1 -top-[46px] h-[calc(100%+184px)]" />
              {entries.slice(0, -1).map((entry, i) => (
                <Milestone key={i} entry={entry} />
              ))}
            </div>
          )}
          <Milestone entry={last} />
        </div>
      </div>
    </LightSection>
  );
}
