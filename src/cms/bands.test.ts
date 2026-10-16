import { describe, expect, it } from "vitest";
import { bandTones, isDark } from "./bands";

describe("bandTones", () => {
  it("gives the field-building bands", () => {
    expect(bandTones(["hero", "quoteBand", "cardList", "cardList", "applicationSection"])).toEqual([
      "white",
      "navy",
      "white",
      "tint",
      "white",
    ]);
  });

  it("alternates light bands after the hero and restarts on white after a dark band", () => {
    expect(bandTones(["hero", "textSection", "cardList", "quoteBand", "timeline", "applicationSection"])).toEqual([
      "white",
      "tint",
      "white",
      "navy",
      "white",
      "tint",
    ]);
  });

  it("alternates dark bands navy and black, so neighbours never match", () => {
    expect(bandTones(["hero", "quoteBand", "teamGrid", "textSection", "quoteBand"])).toEqual([
      "white",
      "navy",
      "black",
      "white",
      "navy",
    ]);
  });

  it("never puts two bands of one colour next to each other", () => {
    const types = ["hero", "quoteBand", "textSection", "cardList", "teamGrid", "timeline", "applicationSection"] as const;
    for (let i = 0; i < 500; i++) {
      const seq = ["hero" as const, ...Array.from({ length: 8 }, (_, j) => types[1 + ((i * 7 + j * 13 + i * j) % 6)])];
      const tones = bandTones(seq);
      for (let k = 1; k < tones.length; k++) expect(tones[k]).not.toBe(tones[k - 1]);
    }
  });

  it("knows which blocks are dark", () => {
    expect(isDark("quoteBand")).toBe(true);
    expect(isDark("teamGrid")).toBe(true);
    expect(isDark("cardList")).toBe(false);
  });
});
