import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../defaults";
import { gdeltQuery } from "./gdelt";

describe("gdeltQuery", () => {
  it("searches a phrase from every topic, in turn, when they cannot all fit", () => {
    const query = gdeltQuery(DEFAULT_SETTINGS.topics)!;
    for (const topic of DEFAULT_SETTINGS.topics) {
      const first = topic.include.find((k) => k.includes(" "));
      if (first) expect(query).toContain(`"${first.toLowerCase()}"`);
    }
    expect(query.match(/" OR "/g)).toHaveLength(13);
    expect(query).toMatch(/\) sourcelang:english$/);
  });

  it("has nothing to search without a multi-word keyword", () => {
    expect(gdeltQuery([{ ...DEFAULT_SETTINGS.topics[0], include: ["fine"] }])).toBeNull();
  });
});
