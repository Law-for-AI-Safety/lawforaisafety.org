import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { draftMatchesFile, isValidDraft, pageState, parseDraft } from "./drafts";

const fileText = fs.readFileSync("content/field-building.json", "utf8");
const file = JSON.parse(fileText);

describe("draft shape", () => {
  it("accepts an unfinished draft that keeps the page's shape", () => {
    const draft = { ...file, title: "", blocks: [{ ...file.blocks[0], lede: "" }, { type: "cardList", style: "bullets", heading: "", items: [] }] };
    const result = parseDraft("field-building", draft);
    expect(result).toEqual({ ok: true, value: draft });
    expect(isValidDraft("field-building", draft)).toBe(false);
  });

  it("refuses a value that is not a page", () => {
    const result = parseDraft("field-building", { ...file, blocks: [{ type: "script", src: "x" }] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/^The draft is not in the shape of a page:\n/);
    expect(parseDraft("field-building", { ...file, colour: "red" }).ok).toBe(false);
    expect(parseDraft("field-building", { ...file, title: "x".repeat(121) }).ok).toBe(false);
  });
});

describe("Draft versus Live", () => {
  it("is Live with no draft, or a draft identical to the file", () => {
    expect(pageState("field-building", null, fileText)).toBe("live");
    expect(pageState("field-building", structuredClone(file), fileText)).toBe("live");
    // Key order does not matter: the file is written in schema order.
    const { blocks, ...rest } = file;
    expect(draftMatchesFile("field-building", { blocks, ...rest }, fileText)).toBe(true);
  });

  it("is Draft when the draft differs or is unfinished", () => {
    expect(pageState("field-building", { ...file, title: "Changed" }, fileText)).toBe("draft");
    expect(pageState("field-building", { ...file, title: "" }, fileText)).toBe("draft");
  });
});
