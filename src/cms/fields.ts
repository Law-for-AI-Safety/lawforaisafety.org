import { pageRules, type BlockType, type FormType } from "./pages";

/**
 * What the editor shows for each block: its fields, in order, with labels and limits. The
 * schema (`./schema`) stays the authority on what is valid; `fields.test.ts` checks the two
 * agree. Rich-text fields use the toolbar editor, plain ones a text input, image fields a
 * picker of existing images.
 */

export type FieldSpec =
  | { kind: "plain"; key: string; label: string; max: number; optional?: boolean; long?: boolean; hint?: string }
  | { kind: "rich"; key: string; label: string; max: number; rich: "inline" | "blocks"; optional?: boolean }
  | { kind: "image"; key: string; label: string }
  | { kind: "boolean"; key: string; label: string; hint?: string }
  | { kind: "list"; key: string; label: string; itemLabel: string; max: number; fields: FieldSpec[] };

export const BLOCK_LABELS: Record<BlockType, string> = {
  hero: "Page heading",
  quoteBand: "Quote band",
  textSection: "Text section",
  cardList: "Card list",
  teamGrid: "Team",
  timeline: "Timeline",
  applicationSection: "Application form",
};

export const PAGE_FIELDS: FieldSpec[] = [
  { kind: "plain", key: "title", label: "Page title", max: 120, hint: "Shown in the browser tab and search results." },
  { kind: "plain", key: "description", label: "Description", max: 300, long: true, hint: "Shown in search results." },
  { kind: "image", key: "shareImage", label: "Share image (optional)" },
];

const heading: FieldSpec = { kind: "plain", key: "heading", label: "Heading", max: 200 };

const CARD_FIELDS: FieldSpec[] = [
  { kind: "plain", key: "title", label: "Title", max: 200 },
  { kind: "rich", key: "body", label: "Text", max: 3000, rich: "inline" },
];
const cards: FieldSpec = { kind: "list", key: "items", label: "Items", itemLabel: "Item", max: 12, fields: CARD_FIELDS };

type AnyBlock = { type: BlockType; [key: string]: unknown };

/** The fields of a block. A card list's depend on its style, an application form's on its form. */
export function blockFields(block: AnyBlock): FieldSpec[] {
  switch (block.type) {
    case "hero":
      return [heading, { kind: "rich", key: "lede", label: "Introduction", max: 1000, rich: "inline" }];
    case "quoteBand":
      return [{ kind: "rich", key: "quote", label: "Quote", max: 600, rich: "inline" }];
    case "textSection":
      return [heading, { kind: "rich", key: "body", label: "Text", max: 6000, rich: "blocks" }];
    case "cardList":
      return block.style === "bullets" ? [heading, cards] : [cards];
    case "teamGrid":
      return [
        heading,
        {
          kind: "list",
          key: "members",
          label: "People",
          itemLabel: "Person",
          max: 40,
          fields: [
            { kind: "plain", key: "name", label: "Name", max: 100 },
            { kind: "plain", key: "role", label: "Role", max: 200 },
            { kind: "plain", key: "bio", label: "Bio", max: 1000, long: true },
            { kind: "plain", key: "linkedin", label: "LinkedIn page (optional)", max: 300, optional: true, hint: "A https://www.linkedin.com/ link." },
            { kind: "image", key: "photo", label: "Photo (optional)" },
            { kind: "plain", key: "photoAlt", label: "Photo description for screen readers", max: 200, optional: true, hint: "Needed with a photo." },
          ],
        },
      ];
    case "timeline":
      return [
        heading,
        {
          kind: "list",
          key: "entries",
          label: "Entries",
          itemLabel: "Entry",
          max: 30,
          fields: [
            { kind: "plain", key: "date", label: "Date", max: 60, hint: "Each date only once." },
            { kind: "plain", key: "time", label: "Time (optional)", max: 40, optional: true, hint: 'For example "09:00 CEST", or "tentative".' },
            { kind: "plain", key: "utc", label: "Exact time in UTC (optional)", max: 40, optional: true, hint: "For example 2026-10-12T07:00:00Z. Shown in each visitor's own time zone." },
            { kind: "plain", key: "text", label: "Text", max: 500, long: true },
          ],
        },
      ];
    case "applicationSection":
      return [
        heading,
        { kind: "rich", key: "intro", label: "Introduction", max: 6000, rich: "blocks" },
        { kind: "boolean", key: "showForm", label: "Show the application form", hint: "When off, the closed message shows instead." },
        ...(block.form === "redLines"
          ? [{ kind: "rich", key: "formNote", label: "Note above the form (optional)", max: 6000, rich: "blocks", optional: true } as const]
          : []),
        { kind: "rich", key: "closedMessage", label: "Closed message", max: 6000, rich: "blocks" },
      ];
  }
}

/** A new, empty item for a list field. */
export function newItem(fields: FieldSpec[]): Record<string, unknown> {
  const item: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.kind === "plain" || field.kind === "rich") {
      if (!field.optional) item[field.key] = "";
    } else if (field.kind === "list") {
      item[field.key] = [];
    } else if (field.kind === "boolean") {
      item[field.key] = true;
    }
  }
  return item;
}

/** A new, empty block of a type for a page. Its text is blank until the editor fills it in. */
export function newBlock(type: BlockType, slug: string): AnyBlock {
  switch (type) {
    case "cardList":
      return { type, style: "bullets", heading: "", items: [newItem(CARD_FIELDS)] };
    case "applicationSection": {
      const form: FormType = pageRules(slug).forms[0] ?? "apply";
      return { type, form, ...newItem(blockFields({ type, form })) };
    }
    default: {
      const block: AnyBlock = { type, ...newItem(blockFields({ type })) };
      for (const field of blockFields(block)) {
        if (field.kind === "list") block[field.key] = [newItem(field.fields)];
      }
      return block;
    }
  }
}

/**
 * Where a problem is, in the editor's words: "Block 3 (Card list) › Item 2 › Text". `page` is
 * the draft the path points into.
 */
export function describePath(page: { blocks?: unknown }, at: (string | number)[]): string {
  if (at.length === 0) return "Page";
  const [first, index, ...rest] = at;
  if (first !== "blocks") return PAGE_FIELDS.find((f) => f.key === first)?.label ?? String(first);
  const blocks = Array.isArray(page.blocks) ? (page.blocks as AnyBlock[]) : [];
  const block = typeof index === "number" ? blocks[index] : undefined;
  if (!block || !Object.hasOwn(BLOCK_LABELS, block.type)) return index === undefined ? "Blocks" : `Block ${Number(index) + 1}`;
  const parts = [`Block ${Number(index) + 1} (${BLOCK_LABELS[block.type]})`];
  let fields = blockFields(block);
  for (let i = 0; i < rest.length; i++) {
    const field = fields.find((f) => f.key === rest[i]);
    if (!field) break;
    parts.push(field.label);
    if (field.kind === "list" && typeof rest[i + 1] === "number") {
      parts.push(`${field.itemLabel} ${(rest[i + 1] as number) + 1}`);
      fields = field.fields;
      i++;
    } else {
      break;
    }
  }
  return parts.join(" › ");
}
