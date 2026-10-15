import { describe, expect, it } from "vitest";
import { BLOCK_LABELS, blockFields, describePath, newBlock, newItem, PAGE_FIELDS, type FieldSpec } from "./fields";
import { BLOCK_TYPES, type BlockType } from "./pages";
import { blockSchema, pageSchema } from "./schema";

/** A value for each field that the strict schema accepts, filling every optional field. */
function filled(fields: FieldSpec[]): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.kind === "plain") value[f.key] = f.key === "linkedin" ? "https://www.linkedin.com/in/a/" : f.key === "utc" ? "2026-10-12T07:00:00Z" : `${f.key} text`;
    if (f.kind === "rich") value[f.key] = `Some **${f.key}**.`;
    if (f.kind === "image") value[f.key] = "/images/team-group.webp";
    if (f.kind === "boolean") value[f.key] = true;
    if (f.kind === "list") value[f.key] = [filled(f.fields)];
  }
  return value;
}

/** The block of `type` with every field its spec lists filled in. */
function filledBlock(type: BlockType, extra: Record<string, unknown> = {}) {
  const base = { type, ...extra };
  return { ...base, ...filled(blockFields(base)) };
}

const variants: Record<string, unknown>[] = [
  ...BLOCK_TYPES.filter((t) => t !== "cardList" && t !== "applicationSection").map((t) => filledBlock(t)),
  filledBlock("cardList", { style: "numbered" }),
  filledBlock("cardList", { style: "bullets" }),
  filledBlock("applicationSection", { form: "apply" }),
  filledBlock("applicationSection", { form: "redLines" }),
];

describe("the editor's field lists agree with the schema", () => {
  it.each(variants.map((v) => [`${v.type} ${v.style ?? v.form ?? ""}`, v]))("%s: every field filled in is valid", (_, block) => {
    expect(blockSchema("strict").safeParse(block).error?.issues ?? []).toEqual([]);
  });

  // Checked in a draft, which has the same limits without the rules on what the text says.
  it.each(variants.map((v) => [`${v.type} ${v.style ?? v.form ?? ""}`, v]))("%s: each field's limit is the schema's", (_, block) => {
    const check = (fields: FieldSpec[], at: (v: Record<string, unknown>) => Record<string, unknown>) => {
      for (const f of fields) {
        const copy = structuredClone(block);
        if (f.kind === "plain" || f.kind === "rich") {
          at(copy)[f.key] = "x".repeat(f.max);
          expect(blockSchema("draft").safeParse(copy).success, `${f.key} at its limit`).toBe(true);
          at(copy)[f.key] = "x".repeat(f.max + 1);
          expect(blockSchema("draft").safeParse(copy).success, `${f.key} over its limit`).toBe(false);
        }
        if (f.kind === "list") {
          const items = at(copy)[f.key] as unknown[];
          at(copy)[f.key] = Array.from({ length: f.max + 1 }, (_, i) => ({ ...(items[0] as object), date: `d${i}` }));
          expect(blockSchema("draft").safeParse(copy).success, `${f.key} over its limit`).toBe(false);
          check(f.fields, (v) => (at(v)[f.key] as Record<string, unknown>[])[0]);
        }
      }
    };
    check(blockFields(block as { type: BlockType }), (v) => v);
  });

  it("covers every key the page itself has", () => {
    const value = { ...filled(PAGE_FIELDS), updatedAt: "2026-10-15", blocks: [filledBlock("hero")] };
    expect(pageSchema("a-page").safeParse(value).error?.issues ?? []).toEqual([]);
  });

  it("names every block type", () => {
    expect(Object.keys(BLOCK_LABELS).sort()).toEqual([...BLOCK_TYPES].sort());
  });
});

describe("new blocks", () => {
  it.each(BLOCK_TYPES)("a new %s keeps the shape of a draft", (type) => {
    expect(blockSchema("draft").safeParse(newBlock(type, "field-building")).success).toBe(true);
  });

  it("start lists with one empty item, and card lists with a heading", () => {
    expect(newBlock("timeline", "x")).toEqual({ type: "timeline", heading: "", entries: [{ date: "", text: "" }] });
    expect(newBlock("cardList", "x")).toEqual({ type: "cardList", style: "bullets", heading: "", items: [{ title: "", body: "" }] });
  });

  it("show the page's own form", () => {
    expect(newBlock("applicationSection", "field-building")).toEqual({
      type: "applicationSection",
      form: "apply",
      heading: "",
      intro: "",
      showForm: true,
      closedMessage: "",
    });
    expect(newBlock("applicationSection", "a-text-page")).toMatchObject({ form: "apply" });
  });

  it("leave optional fields out of a new item", () => {
    expect(newItem([{ kind: "list", key: "l", label: "L", itemLabel: "I", max: 1, fields: [] }, { kind: "image", key: "i", label: "I" }])).toEqual({ l: [] });
  });
});

describe("describing where a problem is", () => {
  const page = { blocks: [filledBlock("hero"), filledBlock("teamGrid"), filledBlock("cardList", { style: "numbered" })] };
  it.each([
    [[], "Page"],
    [["title"], "Page title"],
    [["shareImage"], "Share image (optional)"],
    [["updatedAt"], "updatedAt"],
    [["blocks"], "Blocks"],
    [["blocks", 0], "Block 1 (Page heading)"],
    [["blocks", 0, "lede"], "Block 1 (Page heading) › Introduction"],
    [["blocks", 1, "members", 2, "photoAlt"], "Block 2 (Team) › People › Person 3 › Photo description for screen readers"],
    [["blocks", 1, "members"], "Block 2 (Team) › People"],
    [["blocks", 2, "items", 0], "Block 3 (Card list) › Items › Item 1"],
    [["blocks", 2, "unknown"], "Block 3 (Card list)"],
    [["blocks", 9, "x"], "Block 10"],
  ] as [(string | number)[], string][])("%j", (at, words) => {
    expect(describePath(page, at)).toBe(words);
  });

  it("copes with a page with no blocks, or a block of an unknown type", () => {
    expect(describePath({}, ["blocks", 0])).toBe("Block 1");
    expect(describePath({ blocks: [{ type: "toString" }] }, ["blocks", 0])).toBe("Block 1");
  });
});
