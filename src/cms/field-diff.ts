import { BLOCK_LABELS, describePath } from "./fields";
import type { BlockType } from "./pages";
import type { ProblemPath } from "./publish-checks";

/**
 * Which fields differ between two versions of a page, in the editor's words, with the text
 * before and after. The pull request body lists these for the reviewer, and a refused publish
 * lists them for the editor when the live page changed under their draft.
 *
 * Every text, yes/no and card style counts as a field. When blocks are added, removed or
 * moved, the block list itself is one more change. `updatedAt` is left out: every publish
 * sets it.
 */

export type FieldChange = { path: ProblemPath; label: string; before: string; after: string };

export const NONE = "(none)";
export const EMPTY = "(empty)";

/** Keys that are not fields of their own: the block list change covers them. */
const STRUCTURAL = new Set(["type", "form"]);

type Value = unknown;

function show(value: Value): string {
  if (value === undefined || value === null) return NONE;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value === "" ? EMPTY : value;
  return JSON.stringify(value);
}

function isObject(value: Value): value is Record<string, Value> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keysOf(a: Value, b: Value): (string | number)[] {
  if (Array.isArray(a) || Array.isArray(b)) {
    const length = Math.max(Array.isArray(a) ? a.length : 0, Array.isArray(b) ? b.length : 0);
    return Array.from({ length }, (_, i) => i);
  }
  const keys = [...Object.keys(isObject(a) ? a : {})];
  for (const key of Object.keys(isObject(b) ? b : {})) if (!keys.includes(key)) keys.push(key);
  return keys;
}

function child(value: Value, key: string | number): Value {
  if (Array.isArray(value)) return value[key as number];
  return isObject(value) ? value[key as string] : undefined;
}

function blockList(page: Value): string {
  const blocks = child(page, "blocks");
  if (!Array.isArray(blocks) || blocks.length === 0) return NONE;
  return blocks
    .map((block) => {
      const type = child(block, "type");
      return typeof type === "string" && Object.hasOwn(BLOCK_LABELS, type) ? BLOCK_LABELS[type as BlockType] : "Unknown block";
    })
    .join(", ");
}

function label(before: Value, after: Value, path: ProblemPath): string {
  const page = (child(after, "blocks") !== undefined ? after : before) as { blocks?: unknown };
  const last = path.at(-1);
  if (last === "style") return `${describePath(page, path.slice(0, -1))} › Style`;
  return describePath(page, path);
}

export function changedFields(before: Value, after: Value): FieldChange[] {
  const changes: FieldChange[] = [];
  const beforeBlocks = blockList(before);
  const afterBlocks = blockList(after);

  const walk = (a: Value, b: Value, path: ProblemPath) => {
    if ((isObject(a) || Array.isArray(a)) || (isObject(b) || Array.isArray(b))) {
      for (const key of keysOf(a, b)) {
        if (path.length === 0 && key === "updatedAt") continue;
        if (typeof key === "string" && STRUCTURAL.has(key) && path.length > 0) continue;
        walk(child(a, key), child(b, key), [...path, key]);
      }
      return;
    }
    if (a === b) return;
    changes.push({ path, label: label(before, after, path), before: show(a), after: show(b) });
  };
  walk(before, after, []);

  if (beforeBlocks !== afterBlocks) {
    changes.unshift({ path: ["blocks"], label: "Blocks on the page", before: beforeBlocks, after: afterBlocks });
  }
  return changes;
}
