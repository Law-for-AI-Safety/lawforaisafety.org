import { describe, expect, it } from "vitest";
import type { NewsRadarItem, NewsRadarRun } from "@/lib/news-radar-store";
import { groupByWeek, isRunning, isSeenBefore, RUN_STALE_MS, runSummary, weekStart } from "./view";

const item = (id: string, firstSeen: string, storyKey = id): NewsRadarItem =>
  ({ id, storyKey, firstSeenAt: new Date(firstSeen), lastSeenAt: new Date(firstSeen) }) as NewsRadarItem;

describe("weekStart", () => {
  it.each([
    ["2026-11-30T06:00:00Z", "2026-11-30T00:00:00.000Z"],
    ["2026-12-06T23:59:00Z", "2026-11-30T00:00:00.000Z"],
    ["2026-12-02T12:00:00Z", "2026-11-30T00:00:00.000Z"],
  ])("%s is in the week of %s", (date, monday) => {
    expect(weekStart(new Date(date)).toISOString()).toBe(monday);
  });
});

describe("groupByWeek", () => {
  it("puts weeks newest first, and one story's copies together", () => {
    const weeks = groupByWeek([item("a", "2026-12-07T06:00:00Z", "s"), item("b", "2026-12-07T06:00:00Z", "s"), item("c", "2026-11-30T06:00:00Z")]);
    expect(weeks.map((w) => [w.start.toISOString().slice(0, 10), w.stories.map((s) => [s.item.id, s.alsoIn.map((x) => x.id)])])).toEqual([
      ["2026-12-07", [["a", ["b"]]]],
      ["2026-11-30", [["c", []]]],
    ]);
  });
});

describe("isSeenBefore", () => {
  it("is true once a later run has found it again", () => {
    expect(isSeenBefore({ firstSeenAt: new Date(1), lastSeenAt: new Date(1) })).toBe(false);
    expect(isSeenBefore({ firstSeenAt: new Date(1), lastSeenAt: new Date(2) })).toBe(true);
  });
});

describe("runSummary", () => {
  const run = (over: Partial<NewsRadarRun>): NewsRadarRun => ({
    id: "r",
    trigger: "schedule",
    triggeredBy: null,
    startedAt: new Date("2026-11-30T06:00:00Z"),
    finishedAt: new Date("2026-11-30T06:00:20Z"),
    sources: [
      { source: "google_news", ok: true, found: 40, relevant: 12 },
      { source: "gdelt", ok: false, error: "GDELT answered 429" },
    ],
    newCount: 9,
    seenCount: 3,
    email: "Sent to group@example.org.",
    error: null,
    ...over,
  });

  it("says when it ran, what each source did and what failed", () => {
    expect(runSummary(run({}))).toEqual({
      when: "Mon 30 Nov, 06:00 UTC (weekly run)",
      running: false,
      sources: ["Google News: 40 found, 12 relevant"],
      failures: ["GDELT failed this week: GDELT answered 429"],
      counts: "9 new, 3 seen before",
      email: "Sent to group@example.org.",
      error: null,
    });
  });

  it("says who ran it by hand, and that it is still running", () => {
    const started = new Date("2026-11-30T06:00:00Z");
    const summary = runSummary(run({ trigger: "manual", triggeredBy: "tech@example.com", finishedAt: null }), new Date(started.getTime() + 60_000));
    expect(summary).toMatchObject({ when: "Running since Mon 30 Nov, 06:00 UTC (run by hand by tech@example.com)", running: true, error: null });
    expect(runSummary(run({ trigger: "manual" })).when).toContain("(run by hand)");
  });

  it("says a run stopped when it has been unfinished for longer than one can last", () => {
    const started = new Date("2026-11-30T06:00:00Z");
    expect(isRunning({ startedAt: started, finishedAt: null }, new Date(started.getTime() + RUN_STALE_MS - 1))).toBe(true);
    expect(isRunning({ startedAt: started, finishedAt: null }, new Date(started.getTime() + RUN_STALE_MS))).toBe(false);
    expect(runSummary(run({ finishedAt: null }), new Date(started.getTime() + RUN_STALE_MS))).toMatchObject({
      when: "Mon 30 Nov, 06:00 UTC (weekly run)",
      running: false,
      error: "it stopped without finishing. The news-radar-run function's log on Netlify says why.",
    });
  });
});
