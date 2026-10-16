import { describe, expect, it } from "vitest";
import content from "../../content/field-building.json";
import { previewBlocks } from "./preview";
import { parsePage } from "./schema";

const live = parsePage("field-building", content).blocks;
const [hero, quote] = live;
const draft = (...blocks: unknown[]) => ({ ...content, blocks });

describe("previewBlocks", () => {
  it("shows each finished block, marking only those that differ from the live page", () => {
    const blocks = previewBlocks(draft(hero, { ...quote, quote: "A new quote." }), [], live);
    expect(blocks).toEqual([
      { index: 0, label: "Page heading", shown: hero, problems: [], changed: false },
      { index: 1, label: "Quote band", shown: { ...quote, quote: "A new quote." }, problems: [], changed: true },
    ]);
  });

  it("keeps an unfinished block's last finished version, and says what needs fixing", () => {
    const [block] = previewBlocks(draft({ ...hero, heading: "" }), [hero], live);
    expect(block).toEqual({ index: 0, label: "Page heading", shown: hero, problems: ["Heading: Required"], changed: true });
  });

  it("shows nothing for an unfinished block with no finished version of its type", () => {
    expect(previewBlocks(draft({ ...hero, heading: "" }), [], live)[0].shown).toBeNull();
    // A block moved into this place: what was shown here was another type.
    expect(previewBlocks(draft({ ...hero, heading: "" }), [quote], live)[0].shown).toBeNull();
  });

  it("names a problem with the block itself, and a block of no known type", () => {
    const [block] = previewBlocks(draft({ type: "carousel" }), [], live);
    expect(block.label).toBe("Block");
    expect(block.problems).toEqual([expect.stringMatching(/^This block: /)]);
    expect(previewBlocks(draft("not a block"), [], live)[0].label).toBe("Block");
  });

  it("has no blocks for a draft without a block list", () => {
    expect(previewBlocks(null, [], live)).toEqual([]);
    expect(previewBlocks({ blocks: "none" }, [], live)).toEqual([]);
  });
});
