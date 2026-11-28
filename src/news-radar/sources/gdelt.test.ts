import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../defaults";
import { gdeltQueries, QUERY_MAX_CHARS } from "./gdelt";

describe("gdeltQueries", () => {
  it("searches a phrase from every topic, in turn, in queries short enough for GDELT", () => {
    const queries = gdeltQueries(DEFAULT_SETTINGS.topics);
    expect(queries).toHaveLength(2);
    for (const query of queries) {
      expect(query.length).toBeLessThanOrEqual(QUERY_MAX_CHARS);
      expect(query).toMatch(/^\("[^"]+"( OR "[^"]+")*\) sourcelang:english$/);
    }
    const all = queries.join(" ");
    for (const topic of DEFAULT_SETTINGS.topics) {
      const first = topic.include.find((k) => k.includes(" "));
      if (first) expect(all).toContain(`"${first.toLowerCase()}"`);
    }
    expect(all.match(/"[^"]+"/g)).toHaveLength(14);
  });

  it("has nothing to search without a multi-word keyword", () => {
    expect(gdeltQueries([{ ...DEFAULT_SETTINGS.topics[0], include: ["fine"] }])).toEqual([]);
  });
});
