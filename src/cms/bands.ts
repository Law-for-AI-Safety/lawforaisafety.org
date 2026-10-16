import type { BlockType } from "./pages";

/**
 * Background bands alternate automatically, so no arrangement of blocks puts two bands of
 * one colour next to each other and editors never choose a colour.
 *
 * - The hero is always white.
 * - Dark blocks (quote band, team grid) alternate navy and black, starting with navy.
 * - Every other block is light: white straight after a dark band, otherwise the opposite of
 *   the light band before it (white, then a faint navy tint).
 */
export type LightTone = "white" | "tint";
export type DarkTone = "navy" | "black";
export type Tone = LightTone | DarkTone;

const DARK: ReadonlySet<BlockType> = new Set<BlockType>(["quoteBand", "teamGrid"]);

export function isDark(type: BlockType): boolean {
  return DARK.has(type);
}

export function bandTones(types: readonly BlockType[]): Tone[] {
  const tones: Tone[] = [];
  let darkCount = 0;
  for (const type of types) {
    const prev = tones[tones.length - 1];
    if (type === "hero") tones.push("white");
    else if (isDark(type)) tones.push(darkCount++ % 2 === 0 ? "navy" : "black");
    else tones.push(prev === "white" ? "tint" : "white");
  }
  return tones;
}

/** Background classes, written out in full so Tailwind finds them. */
export const LIGHT_BAND: Record<LightTone, string> = {
  white: "bg-brand-white",
  tint: "bg-brand-navy/[0.04]",
};

export const DARK_BAND: Record<DarkTone, string> = {
  navy: "bg-brand-navy",
  black: "bg-brand-black",
};
