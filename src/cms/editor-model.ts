import { BLOCK_TYPES, pageRules, type BlockType } from "./pages";

/**
 * The block list operations the editor offers, within a page's rules: the hero stays first
 * and is never removed or moved, and a block type can be added only while the page has
 * fewer than its maximum.
 */

export type DraftBlock = { type: BlockType; [key: string]: unknown };
export type DraftPage = { blocks: DraftBlock[]; [key: string]: unknown };

/** The block types the editor may add to a page that holds `blocks`. */
export function addableBlockTypes(slug: string, blocks: DraftBlock[]): BlockType[] {
  const rules = pageRules(slug);
  return BLOCK_TYPES.filter((type) => {
    const max = rules.blocks[type];
    if (max === undefined || type === "hero") return false;
    return blocks.filter((b) => b.type === type).length < max;
  });
}

/** Whether the block at `index` may be moved or removed. */
export function isLockedBlock(blocks: DraftBlock[], index: number): boolean {
  return index === 0 && blocks[0]?.type === "hero";
}

/** Whether the block at `index` can move by `by` places (-1 up, 1 down). */
export function canMoveBlock(blocks: DraftBlock[], index: number, by: -1 | 1): boolean {
  const to = index + by;
  if (to < 0 || to >= blocks.length) return false;
  return !isLockedBlock(blocks, index) && !isLockedBlock(blocks, to);
}

export function moveBlock(blocks: DraftBlock[], index: number, by: -1 | 1): DraftBlock[] {
  if (!canMoveBlock(blocks, index, by)) return blocks;
  const out = [...blocks];
  [out[index], out[index + by]] = [out[index + by], out[index]];
  return out;
}

export function removeBlock(blocks: DraftBlock[], index: number): DraftBlock[] {
  if (isLockedBlock(blocks, index)) return blocks;
  return blocks.filter((_, i) => i !== index);
}

/**
 * Sets the value at `path` inside `value`, copying each object and array on the way. An
 * `undefined` value removes an object key, which is how an optional field is left out.
 */
export function setIn<T>(value: T, path: (string | number)[], next: unknown): T {
  if (path.length === 0) return next as T;
  const [head, ...rest] = path;
  if (Array.isArray(value)) {
    const out = [...value];
    out[head as number] = setIn(out[head as number], rest, next);
    return out as T;
  }
  const out = { ...(value as Record<string, unknown>) };
  const child = setIn(out[head], rest, next);
  if (child === undefined) delete out[head];
  else out[head] = child;
  return out as T;
}

/** Switches a card list between numbered sections and a heading over bullet points. */
export function setCardListStyle(block: DraftBlock, style: "numbered" | "bullets"): DraftBlock {
  if (block.style === style) return block;
  const { type, items } = block;
  return style === "numbered" ? { type, style, items } : { type, style, heading: "", items };
}
