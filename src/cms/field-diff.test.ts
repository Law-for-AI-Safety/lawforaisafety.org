import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { changedFields } from "./field-diff";

const file = JSON.parse(fs.readFileSync("content/field-building.json", "utf8"));
const copy = () => structuredClone(file);

describe("changedFields", () => {
  it("finds nothing between a page and itself, or when only updatedAt changed", () => {
    expect(changedFields(file, copy())).toEqual([]);
    expect(changedFields(file, { ...copy(), updatedAt: "2030-01-01" })).toEqual([]);
  });

  it("names each changed field in the editor's words, with before and after", () => {
    const after = copy();
    after.title = "New title";
    after.blocks[0].lede = "New lede";
    after.blocks[2].items[1].title = "";
    expect(changedFields(file, after)).toEqual([
      { path: ["title"], label: "Page title", before: file.title, after: "New title" },
      { path: ["blocks", 0, "lede"], label: "Block 1 (Page heading) › Introduction", before: file.blocks[0].lede, after: "New lede" },
      { path: ["blocks", 2, "items", 1, "title"], label: "Block 3 (Card list) › Items › Item 2 › Title", before: file.blocks[2].items[1].title, after: "(empty)" },
    ]);
  });

  it("shows yes/no fields, card styles, and fields that appear or go", () => {
    const after = copy();
    const apply = after.blocks.findIndex((b: { type: string }) => b.type === "applicationSection");
    after.blocks[apply].showForm = false;
    after.blocks[2].style = "bullets";
    after.blocks[2].heading = "A heading";
    after.shareImage = "/images/x.webp";
    expect(changedFields(file, after)).toEqual([
      { path: ["blocks", 2, "style"], label: "Block 3 (Card list) › Style", before: "numbered", after: "bullets" },
      { path: ["blocks", 2, "heading"], label: "Block 3 (Card list) › Heading", before: "(none)", after: "A heading" },
      { path: ["blocks", apply, "showForm"], label: `Block ${apply + 1} (Application form) › Show the application form`, before: "Yes", after: "No" },
      { path: ["shareImage"], label: "Share image (optional)", before: "(none)", after: "/images/x.webp" },
    ]);
  });

  it("lists the blocks when blocks are added, removed or moved", () => {
    const after = copy();
    after.blocks.splice(1, 1);
    const changes = changedFields(file, after);
    expect(changes[0]).toEqual({
      path: ["blocks"],
      label: "Blocks on the page",
      before: "Page heading, Quote band, Card list, Card list, Application form",
      after: "Page heading, Card list, Card list, Application form",
    });
    expect(changes.length).toBeGreaterThan(1);
  });

  it("copes with pages that are not page-shaped", () => {
    expect(changedFields({}, { blocks: [] })).toEqual([]);
    expect(changedFields({ blocks: [{ type: "html" }] }, { blocks: [] })).toEqual([
      { path: ["blocks"], label: "Blocks on the page", before: "Unknown block", after: "(none)" },
    ]);
    expect(changedFields({ count: 1 }, { count: 2 })).toEqual([{ path: ["count"], label: "count", before: "1", after: "2" }]);
  });
});
