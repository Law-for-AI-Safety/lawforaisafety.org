import { BLOCK_LABELS, describePath } from "./fields";
import type { BlockType } from "./pages";
import { blockSchema, type BlockContent } from "./schema";

/**
 * How the preview shows each block of a draft. Each block is checked on its own, so a field
 * that is not finished holds back only its own block: that block keeps its last finished
 * version, or shows as a gap when it has none, and the rest of the page follows the draft.
 */
export type PreviewBlock = {
  /** The block's place in the draft. */
  index: number;
  /** The block's name in the editor. */
  label: string;
  /** What renders: the draft's block when it is finished, else its last finished version, else nothing. */
  shown: BlockContent | null;
  /** What still needs fixing in the draft's block, in the editor's words. */
  problems: string[];
  /** Whether the block differs from every block of the live page. */
  changed: boolean;
};

let strict: ReturnType<typeof blockSchema> | undefined;

function draftBlocks(draft: unknown): unknown[] {
  const blocks = typeof draft === "object" && draft !== null ? (draft as { blocks?: unknown }).blocks : undefined;
  return Array.isArray(blocks) ? blocks : [];
}

function typeOf(block: unknown): BlockType | null {
  const type = typeof block === "object" && block !== null ? (block as { type?: unknown }).type : undefined;
  return typeof type === "string" && Object.hasOwn(BLOCK_LABELS, type) ? (type as BlockType) : null;
}

/**
 * `lastShown` is what the preview showed for each place before, so an unfinished block can
 * keep it; it is kept only while the block at that place is of the same type.
 */
export function previewBlocks(draft: unknown, lastShown: readonly (BlockContent | null)[], live: readonly BlockContent[]): PreviewBlock[] {
  const schema = (strict ??= blockSchema("strict"));
  const blocks = draftBlocks(draft);
  const liveText = new Set(live.map((block) => JSON.stringify(block)));
  return blocks.map((block, index) => {
    const type = typeOf(block);
    const label = type ? BLOCK_LABELS[type] : "Block";
    const result = schema.safeParse(block);
    if (result.success) {
      return { index, label, shown: result.data, problems: [], changed: !liveText.has(JSON.stringify(result.data)) };
    }
    const problems = result.error.issues.map((issue) => {
      const where = describePath({ blocks }, ["blocks", index, ...(issue.path as (string | number)[])]).split(" › ").slice(1).join(" › ");
      return `${where || "This block"}: ${issue.message}`;
    });
    const last = lastShown[index] ?? null;
    return { index, label, shown: last !== null && last.type === type ? last : null, problems, changed: true };
  });
}
