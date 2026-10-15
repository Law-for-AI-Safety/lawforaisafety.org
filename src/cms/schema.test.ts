import { describe, expect, it } from "vitest";
import { applySourceFor, DEFAULT_RULES, pagePath, pageRules, PAGE_RULES } from "./pages";
import { blockSchema, pageSchema, parsePage } from "./schema";

const hero = { type: "hero", heading: "Heading", lede: "Lede with ==flair==." };
const apply = {
  type: "applicationSection",
  form: "apply",
  heading: "Get involved",
  intro: "Apply below.",
  showForm: true,
  closedMessage: "Closed. Email [us](mailto:info@lawforaisafety.org).",
};
const page = (blocks: unknown[], extra: Record<string, unknown> = {}) => ({
  title: "Title",
  description: "Description.",
  updatedAt: "2026-10-15",
  blocks,
  ...extra,
});

const cp = (code: number) => (code >= 0xd800 && code <= 0xdfff ? String.fromCharCode(code) : String.fromCodePoint(code));

const blocks = blockSchema("strict");
const formatBlocks = blockSchema("format");

/** The messages zod gives for a value, each prefixed with its path. */
function problems(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return (result.error?.issues ?? []).map((i) => `${i.path.join(".")}: ${i.message}`);
}

describe("blocks", () => {
  it.each([
    hero,
    { type: "quoteBand", quote: "A quote." },
    { type: "textSection", heading: "H", body: "Para.\n\n- one\n- two" },
    { type: "cardList", style: "numbered", items: [{ title: "T", body: "B [link](/field-building)." }] },
    { type: "cardList", style: "bullets", heading: "H", items: [{ title: "T", body: "B." }] },
    {
      type: "teamGrid",
      heading: "Team",
      members: [
        { name: "A", role: "R", bio: "Bio.", linkedin: "https://www.linkedin.com/in/a/" },
        { name: "B", role: "R", bio: "Bio.", linkedin: "https://linkedin.com/in/b" },
        { name: "C", role: "R", bio: "Bio.", photo: "/images/karolina-gruzel.webp", photoAlt: "Portrait of C" },
      ],
    },
    {
      type: "timeline",
      heading: "Timeline",
      entries: [
        { date: "5 October 2026", text: "Scope" },
        { date: "12 October 2026", time: "09:00 CEST", utc: "2026-10-12T07:00:00Z", text: "Meeting" },
        { date: "March 2027", time: "tentative", text: "Presentation" },
      ],
    },
    apply,
    { ...apply, form: "redLines", formNote: "Takes five minutes." },
    { ...apply, form: "redLines" },
  ])("accepts a valid $type", (block) => {
    expect(problems(blocks.safeParse(block))).toEqual([]);
  });

  it.each([
    [{ type: "unknown" }, "type: Invalid discriminator value"],
    [{ ...hero, colour: "red" }, 'Unrecognized key: "colour"'],
    [{ ...hero, heading: "" }, "heading: Required"],
    [{ ...hero, heading: " padded" }, "heading: No spaces at the start or end"],
    [{ ...hero, heading: "two\nlines" }, "heading: No line breaks"],
    [{ ...hero, heading: "x".repeat(201) }, "heading: At most 200 characters"],
    [{ ...hero, lede: "" }, "lede: Required"],
    [{ ...hero, lede: "One.\n\nTwo." }, "lede: Only one paragraph is allowed here"],
    [{ ...hero, lede: "- a list" }, "lede: Only one paragraph is allowed here"],
    [{ ...hero, lede: "<b>x</b>" }, "lede: HTML is not supported"],
    [{ ...hero, lede: "[x](javascript:alert)" }, "lede: Only https:"],
    [{ ...hero, lede: "[x](http://a.org)" }, "lede: Use https: links"],
    [{ ...hero, lede: "**a****b**" }, "lede: Not in canonical form"],
    [{ ...hero, lede: 5 }, "lede: Invalid input"],
    [{ type: "quoteBand", quote: "x".repeat(601) }, "quote: At most 600 characters"],
    [{ type: "cardList", style: "numbered", heading: "H", items: [{ title: "T", body: "B" }] }, 'Unrecognized key: "heading"'],
    [{ type: "cardList", style: "bullets", items: [{ title: "T", body: "B" }] }, "heading: Invalid input"],
    [{ type: "cardList", style: "grid", items: [] }, "style: Invalid discriminator value"],
    [{ type: "cardList", style: "numbered", items: [] }, "items: Add at least one item"],
    [{ type: "cardList", style: "numbered", items: Array(13).fill({ title: "T", body: "B" }) }, "items: At most 12 items"],
    [{ type: "teamGrid", heading: "T", members: [] }, "members: Add at least one person"],
    [{ type: "teamGrid", heading: "T", members: Array(41).fill({ name: "A", role: "R", bio: "B" }) }, "members: At most 40 people"],
    [{ type: "teamGrid", heading: "T", members: [{ name: "A", role: "R", bio: "B", photo: "/images/a.webp" }] }, "photoAlt: A photo needs alt text"],
    [{ type: "teamGrid", heading: "T", members: [{ name: "A", role: "R", bio: "B", photoAlt: "Alt" }] }, "photoAlt: A photo needs alt text"],
    [{ type: "teamGrid", heading: "T", members: [{ name: "A", role: "R", bio: "B", photo: "https://evil.example/a.png", photoAlt: "A" }] }, "photo: Pick an image from /images/"],
    [{ type: "teamGrid", heading: "T", members: [{ name: "A", role: "R", bio: "B", photo: `/images/${"a".repeat(300)}.webp`, photoAlt: "A" }] }, "photo: At most 300 characters"],
    ...[
      "http://linkedin.com/in/a",
      "https://example.org/in/a",
      "https://linkedin.com.evil.example/in/a",
      "https://evil.linkedin.com/in/a",
      "https://user@linkedin.com/in/a",
      "https://www.linkedin.com",
      "/a",
    ].map((linkedin): [unknown, string] => [{ type: "teamGrid", heading: "T", members: [{ name: "A", role: "R", bio: "B", linkedin }] }, "linkedin: Must be a link to a linkedin.com page"]),
    [{ type: "teamGrid", heading: "T", members: [{ name: "A", role: "R", bio: "B", linkedin: `https://www.linkedin.com/in/${"a".repeat(300)}` }] }, "linkedin: At most 300 characters"],
    [{ type: "timeline", heading: "T", entries: [] }, "entries: Add at least one entry"],
    [{ type: "timeline", heading: "T", entries: Array.from({ length: 31 }, (_, i) => ({ date: `D${i}`, text: "x" })) }, "entries: At most 30 entries"],
    [{ type: "timeline", heading: "T", entries: [{ date: "D", text: "x" }, { date: "D", text: "y" }] }, "entries: Each date may appear only once"],
    [{ type: "timeline", heading: "T", entries: [{ date: "D", utc: "2026-10-12T07:00:00Z", text: "x" }] }, "entries.0.utc: A UTC time needs a time"],
    [{ type: "timeline", heading: "T", entries: [{ date: "D", time: "9", utc: "tomorrow", text: "x" }] }, "entries.0.utc: Invalid ISO datetime"],
    [{ ...apply, showForm: "yes" }, "showForm: Invalid input"],
    [{ ...apply, closedMessage: undefined }, "closedMessage: Invalid input"],
    [{ ...apply, formNote: "Note." }, 'Unrecognized key: "formNote"'],
    [{ ...apply, form: "newsletter" }, "form: Invalid discriminator value"],
  ] as [unknown, string][])("refuses %j", (block, message) => {
    expect(problems(blocks.safeParse(block)).join("\n")).toContain(message);
  });
});

describe("text characters and normalisation", () => {
  const nfd = "Raphaël Kolář".normalize("NFD");

  it.each([0x09, 0xad, 0x200b, 0x200d, 0x2060, 0xfe0f, 0xe0041, 0xd800, 0x202e, 0x2028])(
    "refuses U+%s in plain and rich text",
    (code) => {
      const c = cp(code);
      expect(problems(blocks.safeParse({ ...hero, heading: `a${c}b` })).join()).toContain("heading: No line breaks, tabs, control or invisible");
      expect(problems(blocks.safeParse({ ...hero, lede: `a${c}b` })).join()).toContain("lede: Control or invisible formatting character");
      expect(problems(formatBlocks.safeParse({ ...hero, heading: `a${c}b` })).join()).toContain("heading: No line breaks");
    },
  );

  it("refuses text not in NFC, and format mode normalises it", () => {
    const strict = problems(blocks.safeParse({ ...hero, heading: nfd, lede: nfd })).join("\n");
    expect(strict).toContain("heading: Text is not in Unicode NFC form");
    expect(strict).toContain("lede: Text is not in Unicode NFC form");
    expect(formatBlocks.parse({ ...hero, heading: nfd, lede: `*${nfd}*` })).toMatchObject({
      heading: nfd.normalize("NFC"),
      lede: `*${nfd.normalize("NFC")}*`,
    });
  });
});

describe("format mode", () => {
  it("rewrites fields into canonical form and keys into schema order", () => {
    const result = formatBlocks.parse({
      lede: "  Text with [a link](http://www.youtube.com/@LawforAISafety). ",
      heading: " Heading ",
      type: "hero",
    });
    expect(result).toEqual({ type: "hero", heading: "Heading", lede: "Text with [a link](https://www.youtube.com/@LawforAISafety)." });
    expect(Object.keys(result)).toEqual(["type", "heading", "lede"]);
  });

  it("still refuses what cannot be made canonical", () => {
    expect(problems(formatBlocks.safeParse({ ...hero, lede: "<b>x</b>" })).join()).toContain("lede: HTML is not supported");
    expect(problems(formatBlocks.safeParse({ ...hero, heading: "   " })).join()).toContain("heading: Required");
  });
});

describe("pages", () => {
  it("accepts a valid field-building page", () => {
    expect(problems(pageSchema("field-building").safeParse(page([hero, apply])))).toEqual([]);
  });

  it("accepts a share image from /images/", () => {
    expect(problems(pageSchema("field-building").safeParse(page([hero], { shareImage: "/images/team-group.webp" })))).toEqual([]);
  });

  it.each([
    [page([hero], { shareImage: "https://evil.example/a.png" }), "shareImage: Pick an image from /images/"],
    [page([hero], { shareImage: "/images/../secret.webp" }), "shareImage: Pick an image from /images/"],
    [page([hero], { shareImage: `/images/${"a".repeat(300)}.webp` }), "shareImage: At most 300 characters"],
    [page([hero], { updatedAt: "15/10/2026" }), "updatedAt: Invalid ISO date"],
    [page([hero], { title: "" }), "title: Required"],
    [page([hero], { description: undefined }), "description: Invalid input"],
    [page([hero], { slug: "other" }), 'Unrecognized key: "slug"'],
    [page([]), "blocks: Add at least one block"],
    [page([apply]), "blocks.0: The first block must be the hero"],
    [page([hero, hero]), "blocks.1: This page can have at most 1 hero block(s)"],
    [page([hero, apply, apply]), "blocks.2: This page can have at most 1 applicationSection block(s)"],
    [page([hero, { type: "teamGrid", heading: "T", members: [{ name: "A", role: "R", bio: "B" }] }]), "blocks.1: This page cannot have a teamGrid block"],
    [page([hero, { ...apply, form: "redLines" }]), "blocks.1.form: This page cannot show the redLines form"],
  ])("refuses %j", (value, message) => {
    expect(problems(pageSchema("field-building").safeParse(value)).join("\n")).toContain(message);
  });

  it("lets any other page hold text-only blocks, but no application section", () => {
    const team = { type: "teamGrid", heading: "T", members: [{ name: "A", role: "R", bio: "B" }] };
    expect(problems(pageSchema("a-new-page").safeParse(page([hero, { type: "quoteBand", quote: "Q." }, team])))).toEqual([]);
    expect(problems(pageSchema("a-new-page").safeParse(page([hero, apply]))).join()).toContain(
      "blocks.1: This page cannot have a applicationSection block",
    );
  });

  it("refuses the apply form on a page with no registered apply source", () => {
    PAGE_RULES["test-page-without-source"] = { blocks: { hero: 1, applicationSection: 1 }, forms: ["apply"] };
    try {
      expect(problems(pageSchema("test-page-without-source").safeParse(page([hero, apply]))).join()).toContain(
        "No apply form is registered for /test-page-without-source",
      );
    } finally {
      delete PAGE_RULES["test-page-without-source"];
    }
  });

  it("parsePage returns the page or throws a readable error", () => {
    expect(parsePage("field-building", page([hero])).blocks).toHaveLength(1);
    expect(() => parsePage("field-building", page([apply]))).toThrow(
      /content\/field-building\.json is invalid:\n.*The first block must be the hero/,
    );
  });
});

describe("page rules", () => {
  it("finds rules only for listed pages, not inherited object keys", () => {
    expect(pageRules("field-building")).toBe(PAGE_RULES["field-building"]);
    expect(pageRules("a-new-page")).toBe(DEFAULT_RULES);
    expect(pageRules("toString")).toBe(DEFAULT_RULES);
  });

  it("serves a page at its slug", () => {
    expect(pagePath("field-building")).toBe("/field-building");
  });

  it("finds the apply source registered for a path", () => {
    expect(applySourceFor("/field-building")).toBe("field_building");
    expect(applySourceFor("/nowhere")).toBeUndefined();
  });
});
