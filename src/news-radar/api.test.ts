import { describe, expect, it } from "vitest";
import { DEFAULT_SINCE_DAYS, parseSince, parseTuning } from "./api";
import { DEFAULT_SETTINGS } from "./defaults";

const NOW = new Date("2026-11-27T12:00:00Z");

describe("parseSince", () => {
  it("takes a day, or defaults to the last 90 days", () => {
    expect(parseSince("2026-10-01", NOW)).toEqual({ ok: true, since: new Date("2026-10-01T00:00:00Z") });
    for (const absent of [undefined, null, ""]) {
      expect(parseSince(absent, NOW)).toEqual({ ok: true, since: new Date(NOW.getTime() - DEFAULT_SINCE_DAYS * 86_400_000) });
    }
  });

  it("refuses anything but a real day", () => {
    expect(parseSince("last week", NOW)).toEqual({ ok: false, problem: "since must be a day, as YYYY-MM-DD." });
    expect(parseSince(20261001, NOW)).toEqual({ ok: false, problem: "since must be a day, as YYYY-MM-DD." });
    expect(parseSince("2026-02-30", NOW)).toEqual({ ok: false, problem: "since must be a real day." });
  });
});

describe("parseTuning", () => {
  it("checks the topics and outlets as the settings form does, giving new topics an id", () => {
    const topics = [...DEFAULT_SETTINGS.topics, { name: "New topic", queries: ["q"], include: ["k"], require: [], exclude: [] }];
    const parsed = parseTuning({ topics, trustedOutlets: [" Reuters ", "Reuters"] });
    expect(parsed.ok && parsed.tuning.topics.at(-1)?.id).toBe("new-topic");
    expect(parsed.ok && parsed.tuning.trustedOutlets).toEqual(["Reuters"]);
    expect(parseTuning({ topics: [], trustedOutlets: [] })).toEqual({ ok: false, problem: "Keep at least one topic." });
  });

  it("refuses a recipient, and a body that is not an object", () => {
    expect(parseTuning({ ...DEFAULT_SETTINGS, recipient: "x@example.com" })).toEqual({ ok: false, problem: "The recipient cannot be changed through the API." });
    expect(parseTuning(null)).toEqual({ ok: false, problem: "The body must be a JSON object." });
  });
});
