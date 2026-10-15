import Timeline from "../../app/red-lines-dialogue/Timeline";
import type { LightTone } from "../bands";
import LightSection from "./LightSection";
import Rule from "./Rule";
import type { BlockOf } from "./types";

export default function TimelineBlock({ block, tone, id }: { block: BlockOf<"timeline">; tone: LightTone; id?: string }) {
  return (
    <LightSection tone={tone} id={id}>
      <div className="max-w-4xl mx-auto flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          <Rule />
          <h2 className="text-3xl md:text-4xl font-light text-brand-black leading-tight">{block.heading}</h2>
        </div>
        <Timeline
          items={block.entries.map((entry) => ({
            date: entry.date,
            time: entry.time,
            utc: entry.utc,
            detail: entry.text,
          }))}
        />
      </div>
    </LightSection>
  );
}
