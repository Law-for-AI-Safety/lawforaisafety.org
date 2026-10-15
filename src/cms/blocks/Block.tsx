import type { DarkTone, LightTone, Tone } from "../bands";
import type { BlockContent } from "../schema";
import ApplicationSection from "./ApplicationSection";
import CardList from "./CardList";
import Hero from "./Hero";
import QuoteBand from "./QuoteBand";
import TeamGrid from "./TeamGrid";
import TextSection from "./TextSection";
import TimelineBlock from "./TimelineBlock";

/** Renders one block in its band. `path` is the page's site path. */
export default function Block({ block, tone, path }: { block: BlockContent; tone: Tone; path: string }) {
  const light = tone as LightTone;
  const dark = tone as DarkTone;
  switch (block.type) {
    case "hero":
      return <Hero block={block} />;
    case "quoteBand":
      return <QuoteBand block={block} tone={dark} />;
    case "textSection":
      return <TextSection block={block} tone={light} />;
    case "cardList":
      return <CardList block={block} tone={light} />;
    case "teamGrid":
      return <TeamGrid block={block} tone={dark} />;
    case "timeline":
      return <TimelineBlock block={block} tone={light} />;
    case "applicationSection":
      return <ApplicationSection block={block} tone={light} path={path} />;
  }
}
