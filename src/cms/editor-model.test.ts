import { describe, expect, it } from "vitest";
import { addableBlockTypes, canMoveBlock, isLockedBlock, moveBlock, removeBlock, setCardListStyle, setIn, type DraftBlock } from "./editor-model";

const b = (type: DraftBlock["type"], n = 0): DraftBlock => ({ type, n });
const blocks = [b("hero"), b("quoteBand", 1), b("textSection", 2), b("quoteBand", 3)];

describe("adding blocks", () => {
  it("offers the page's block types that are below their maximum, never a second hero", () => {
    expect(addableBlockTypes("field-building", blocks)).toEqual(["textSection", "cardList", "timeline", "applicationSection"]);
  });

  it("follows the default rules on other pages", () => {
    expect(addableBlockTypes("new-page", [b("hero")])).toEqual(["quoteBand", "textSection", "cardList", "teamGrid", "timeline"]);
  });

  it("offers a hero only to a page without one", () => {
    expect(addableBlockTypes("new-page", [])).not.toContain("hero");
  });
});

describe("moving and removing blocks", () => {
  it("keeps the hero first and in place", () => {
    expect(isLockedBlock(blocks, 0)).toBe(true);
    expect(isLockedBlock(blocks, 1)).toBe(false);
    expect(isLockedBlock([b("textSection")], 0)).toBe(false);
    expect(canMoveBlock(blocks, 0, 1)).toBe(false);
    expect(canMoveBlock(blocks, 1, -1)).toBe(false);
    expect(removeBlock(blocks, 0)).toBe(blocks);
    expect(moveBlock(blocks, 1, -1)).toBe(blocks);
  });

  it("moves other blocks within the list", () => {
    expect(canMoveBlock(blocks, 3, 1)).toBe(false);
    expect(moveBlock(blocks, 1, 1).map((x) => x.n)).toEqual([0, 2, 1, 3]);
    expect(moveBlock(blocks, 3, -1).map((x) => x.n)).toEqual([0, 1, 3, 2]);
    expect(blocks.map((x) => x.n)).toEqual([0, 1, 2, 3]);
  });

  it("removes other blocks", () => {
    expect(removeBlock(blocks, 2).map((x) => x.n)).toEqual([0, 1, 3]);
  });
});

describe("setIn", () => {
  it("sets a nested value without changing the original", () => {
    const value = { a: [{ b: 1 }, { b: 2 }], c: "x" };
    const next = setIn(value, ["a", 1, "b"], 3);
    expect(next).toEqual({ a: [{ b: 1 }, { b: 3 }], c: "x" });
    expect(value.a[1].b).toBe(2);
    expect(next.a[0]).toBe(value.a[0]);
  });

  it("removes a key set to undefined", () => {
    expect(setIn({ a: { b: 1, c: 2 } }, ["a", "b"], undefined)).toEqual({ a: { c: 2 } });
  });

  it("replaces the whole value at an empty path", () => {
    expect(setIn({ a: 1 }, [], 5)).toBe(5);
  });
});

describe("card list style", () => {
  const items = [{ title: "T", body: "B" }];
  it("adds an empty heading for bullets and drops it for numbered sections", () => {
    const numbered: DraftBlock = { type: "cardList", style: "numbered", items };
    const bullets = setCardListStyle(numbered, "bullets");
    expect(bullets).toEqual({ type: "cardList", style: "bullets", heading: "", items });
    expect(setCardListStyle({ ...bullets, heading: "H" }, "numbered")).toEqual(numbered);
    expect(setCardListStyle(numbered, "numbered")).toBe(numbered);
  });
});
