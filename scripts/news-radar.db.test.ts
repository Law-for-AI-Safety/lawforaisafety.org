import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminAuditLog, newsRadarItems, newsRadarRuns, newsRadarSettings } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { getNewsRadarSettings, recordFound, startRun } from "@/lib/news-radar-store";
import { DEFAULT_SETTINGS } from "@/news-radar/defaults";
import { APP_ORIGIN } from "../test/app-fetch";
import { apiKey, runNewsRadarCommand, USAGE } from "./news-radar";

const KEY = "test-key";
const NOW = new Date("2026-11-27T12:00:00Z");
const MONDAY = new Date("2026-11-23T06:00:00Z");

let printed: string[];
let files: Record<string, string>;

function run(...args: string[]) {
  return runNewsRadarCommand(args, {
    baseUrl: APP_ORIGIN,
    key: KEY,
    print: (line) => printed.push(line),
    readFile: (path) => files[path],
  });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await db.delete(adminAuditLog);
  await db.delete(newsRadarItems);
  await db.delete(newsRadarRuns);
  await db.delete(newsRadarSettings);
  const runId = await startRun("schedule", null, MONDAY);
  await recordFound(runId, MONDAY, [
    {
      urlKey: "https://news.test/1",
      titleKey: "a|news",
      storyKey: "a",
      url: "https://news.test/1",
      title: "AI lawsuit webinar",
      outlet: "News",
      snippet: "",
      kind: "news",
      publishedAt: null,
      sources: ["google_news"],
      topics: ["ai-litigation"],
      score: 2,
    },
  ]);
  vi.stubEnv("NEWS_RADAR_API_KEY", KEY);
  printed = [];
  files = {};
});

describe("npm run news-radar", () => {
  it("exports items, all or since a day", async () => {
    expect(await run("export")).toBe(0);
    expect(JSON.parse(printed[0]).items).toMatchObject([{ title: "AI lawsuit webinar", matched: [{ topic: "ai-litigation", keywords: ["lawsuit"] }] }]);
    printed = [];
    expect(await run("export", "--since", "2026-11-24")).toBe(0);
    expect(JSON.parse(printed[0]).items).toEqual([]);
    printed = [];
    expect(await run("export", "--until", "2026-11-23", "--since", "2026-11-01")).toBe(0);
    expect(JSON.parse(printed[0])).toMatchObject({ since: "2026-11-01T00:00:00.000Z", until: "2026-11-23T00:00:00.000Z", items: [] });
  });

  it("gets and puts the settings, edited from what get printed", async () => {
    expect(await run("settings", "get")).toBe(0);
    const got = JSON.parse(printed[0]);
    expect(got.topics).toEqual(DEFAULT_SETTINGS.topics);

    files["settings.json"] = JSON.stringify({ ...got, topics: DEFAULT_SETTINGS.topics.slice(0, 1), trustedOutlets: [] });
    printed = [];
    expect(await run("settings", "put", "settings.json")).toBe(0);
    expect(await getNewsRadarSettings()).toMatchObject({ topics: DEFAULT_SETTINGS.topics.slice(0, 1), trustedOutlets: [], updatedBy: "news-radar@api" });
  });

  it("rescores proposed settings without saving them", async () => {
    const topics = DEFAULT_SETTINGS.topics.map((t) => ({ ...t, exclude: [...t.exclude, "webinar"] }));
    files["proposed.json"] = JSON.stringify({ topics, trustedOutlets: [] });
    expect(await run("rescore", "proposed.json", "--since", "2026-11-01")).toBe(0);
    const body = JSON.parse(printed[0]);
    expect(body.since).toBe("2026-11-01T00:00:00.000Z");
    expect(body.items).toMatchObject([{ title: "AI lawsuit webinar", change: "newly dropped" }]);
    printed = [];
    expect(await run("rescore", "proposed.json", "--until", "2026-11-23")).toBe(0);
    expect(JSON.parse(printed[0]).items).toEqual([]);
    expect((await getNewsRadarSettings()).updatedBy).toBeNull();
  });

  it("says why a request was refused, and fails", async () => {
    files["bad.json"] = JSON.stringify({ topics: [], trustedOutlets: [], updatedAt: null });
    expect(await run("settings", "put", "bad.json")).toBe(1);
    expect(printed).toEqual(["PUT /settings failed with 400: Keep at least one topic."]);
    printed = [];
    expect(await run("export", "--since", "soon")).toBe(1);
    expect(printed[0]).toMatch(/^GET \/items\?since=soon failed with 400: /);
  });

  it("says when a file is not a settings object, without sending it", async () => {
    files["array.json"] = JSON.stringify(DEFAULT_SETTINGS.topics);
    files["broken.json"] = "{";
    expect(await run("rescore", "array.json")).toBe(1);
    expect(printed).toEqual(['array.json must hold a JSON object with "topics" and "trustedOutlets", as settings get prints.']);
    printed = [];
    expect(await run("settings", "put", "broken.json")).toBe(1);
    expect(printed[0]).toMatch(/^Could not read broken.json as JSON: /);
    expect((await getNewsRadarSettings()).updatedBy).toBeNull();
  });

  it("says when the answer is not JSON, with its status", async () => {
    // No route at this address: the CLI pointed at the wrong site gets a page, not JSON.
    const io = {
      baseUrl: "https://lawforaisafety.test",
      key: KEY,
      print: (line: string) => printed.push(line),
      readFile: () => "",
      fetch: async () => new Response("<html>Not found</html>", { status: 404 }),
    };
    expect(await runNewsRadarCommand(["settings", "get"], io)).toBe(1);
    expect(printed).toEqual(["GET /settings failed with 404: the answer was not JSON. Is NEWS_RADAR_API_URL right?"]);
  });

  it("prints its usage for an unknown command or wrong arguments, and never the key", async () => {
    for (const args of [[], ["settings"], ["settings", "put"], ["export", "--from", "x"], ["rescore"], ["rescore", "f.json", "--since"], ["export", "--since", "a", "--since", "b"], ["delete"]]) {
      printed = [];
      expect(await run(...args), args.join(" ")).toBe(2);
      expect(printed).toEqual([USAGE]);
    }
    expect(USAGE).not.toContain(KEY);
  });
});

describe("apiKey", () => {
  it("takes the key from the environment first, then from the local env file", () => {
    expect(apiKey({ NEWS_RADAR_API_KEY: "from-env" }, "NEWS_RADAR_API_KEY=from-file")).toBe("from-env");
    expect(apiKey({}, 'A=1\nNEWS_RADAR_API_KEY="from-file"\n')).toBe("from-file");
    expect(apiKey({}, "NEWS_RADAR_API_KEY='single'\n")).toBe("single");
    expect(apiKey({}, "NEWS_RADAR_API_KEY=bare # a comment\n")).toBe("bare");
    expect(apiKey({}, "NEWS_RADAR_API_KEY=\n")).toBeUndefined();
    expect(apiKey({}, null)).toBeUndefined();
  });
});
