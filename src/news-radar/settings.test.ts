import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./defaults";
import { parseSettings, topicId } from "./settings";

const valid = { topics: [{ id: "a", name: "A", queries: ["q"], include: ["k"], require: [], exclude: [] }], trustedOutlets: [], recipient: "" };

describe("parseSettings", () => {
  it("accepts the defaults", () => {
    expect(parseSettings(DEFAULT_SETTINGS)).toEqual({ ok: true, settings: DEFAULT_SETTINGS });
  });

  it("trims lists, drops blanks and repeats, and lower-cases the recipient", () => {
    const result = parseSettings({
      topics: [{ id: "", name: " New topic ", queries: [" q ", "", "q"], include: ["k"], require: [], exclude: [""] }],
      trustedOutlets: ["Reuters", " "],
      recipient: " Group@Example.org ",
    });
    expect(result).toEqual({
      ok: true,
      settings: {
        topics: [{ id: "new-topic", name: "New topic", queries: ["q"], include: ["k"], require: [], exclude: [] }],
        trustedOutlets: ["Reuters"],
        recipient: "group@example.org",
      },
    });
  });

  it.each([
    [{ ...valid, topics: [] }, "Keep at least one topic."],
    [{ ...valid, topics: [{ ...valid.topics[0], name: " " }] }, "Give each topic a name."],
    [{ ...valid, topics: [{ ...valid.topics[0], queries: [""] }] }, "Give each topic at least one search term."],
    [{ ...valid, topics: [{ ...valid.topics[0], include: [] }] }, "Give each topic at least one include keyword."],
    [{ ...valid, recipient: "not an address" }, "The recipient must be an email address."],
    [{ ...valid, topics: [valid.topics[0], valid.topics[0]] }, "Two topics have the same id."],
    [{ ...valid, trustedOutlets: ["x".repeat(200)] }, "Keep each entry under 120 characters."],
  ])("refuses %j", (input, problem) => {
    expect(parseSettings(input)).toEqual({ ok: false, problem });
  });
});

describe("trusted outlets", () => {
  it("allows up to 100", () => {
    const outlets = (n: number) => Array.from({ length: n }, (_, i) => `Outlet ${i}`);
    expect(parseSettings({ ...valid, trustedOutlets: outlets(100) })).toMatchObject({ ok: true });
    expect(parseSettings({ ...valid, trustedOutlets: outlets(101) })).toEqual({ ok: false, problem: "Keep each list to 100 entries." });
  });
});

describe("topicId", () => {
  it("makes a unique id from the name", () => {
    expect(topicId("GDPR & AI!", new Set())).toBe("gdpr-ai");
    expect(topicId("GDPR & AI!", new Set(["gdpr-ai", "gdpr-ai-2"]))).toBe("gdpr-ai-3");
    expect(topicId("¡¡", new Set())).toBe("topic");
  });
});
