import type { BlockContent } from "../schema";

/** The content of one block type. */
export type BlockOf<T extends BlockContent["type"]> = Extract<BlockContent, { type: T }>;
