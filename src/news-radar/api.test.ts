import { describe, expect, it } from "vitest";
import { DEFAULT_SINCE_DAYS, parseBasedOn, parseRange, parseTuning } from "./api";
import { DEFAULT_SETTINGS } from "./defaults";

const NOW = new Date("2026-11-27T12:00:00Z");

describe("parseRange", () => {
  it("takes days, or defaults to the last 90 days with no end", () => {
    expect(parseRange("2026-10-01", "2026-11-01", NOW)).toEqual({ ok: true, since: new Date("2026-10-01T00:00:00Z"), until: new Date("2026-11-01T00:00:00Z") });
    for (const absent of [undefined, null, ""]) {
      expect(parseRange(absent, absent, NOW)).toEqual({ ok: true, since: new Date(NOW.getTime() - DEFAULT_SINCE_DAYS * 86_400_000), until: null });
    }
  });

  it("refuses anything but real days, in order", () => {
    expect(parseRange("last week", null, NOW)).toEqual({ ok: false, problem: "since must be a day, as YYYY-MM-DD." });
    expect(parseRange(20261001, null, NOW)).toEqual({ ok: false, problem: "since must be a day, as YYYY-MM-DD." });
    expect(parseRange("2026-02-30", null, NOW)).toEqual({ ok: false, problem: "since must be a real day." });
    expect(parseRange(null, "soon", NOW)).toEqual({ ok: false, problem: "until must be a day, as YYYY-MM-DD." });
    expect(parseRange("2026-11-01", "2026-11-01", NOW)).toEqual({ ok: false, problem: "until must be after since." });
  });
});

describe("parseBasedOn", () => {
  it("takes the updatedAt settings get returned, or null for settings never saved", () => {
    expect(parseBasedOn("2026-11-20T10:00:00.123Z")).toEqual({ ok: true, basedOn: new Date("2026-11-20T10:00:00.123Z") });
    expect(parseBasedOn(null)).toEqual({ ok: true, basedOn: null });
    for (const bad of [undefined, "yesterday", 5]) expect(parseBasedOn(bad).ok).toBe(false);
  });
});

describe("parseTuning", () => {
  it("checks the topics and outlets as the settings form does, giving new topics an id", () => {
    const topics = [...DEFAULT_SETTINGS.topics, { name: "New topic", queries: ["q"], include: ["k"] }];
    const parsed = parseTuning({ topics, trustedOutlets: [" Reuters ", "Reuters"] });
    expect(parsed.ok && parsed.tuning.topics.at(-1)).toEqual({ id: "new-topic", name: "New topic", queries: ["q"], include: ["k"], require: [], exclude: [] });
    expect(parsed.ok && parsed.tuning.trustedOutlets).toEqual(["Reuters"]);
    expect(parseTuning({ topics: [], trustedOutlets: [] })).toEqual({ ok: false, problem: "Keep at least one topic." });
  });

  it("refuses a recipient, and a body that is not an object", () => {
    expect(parseTuning({ ...DEFAULT_SETTINGS, recipient: "x@example.com" })).toEqual({ ok: false, problem: "The recipient cannot be changed through the API." });
    expect(parseTuning(null)).toEqual({ ok: false, problem: "The body must be a JSON object." });
  });
});
