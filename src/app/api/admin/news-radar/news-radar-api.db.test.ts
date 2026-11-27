import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminAuditLog, adminSessions, newsRadarItems, newsRadarRuns, newsRadarSettings } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { getNewsRadarSettings, recordFound, saveNewsRadarSettings, setItemState, startRun, type FoundItem } from "@/lib/news-radar-store";
import { startAdminSession } from "@/lib/session";
import { DEFAULT_SETTINGS } from "@/news-radar/defaults";
import { cookieJar } from "../../../../../test/next-headers";
import { GET as getItems } from "./items/route";
import { POST as rescore } from "./rescore/route";
import { GET as getSettings, PUT as putSettings } from "./settings/route";

vi.mock("next/headers", () => import("../../../../../test/next-headers"));

/** The News radar API an agent tunes the radar with: items, settings and the rescore dry run. */

const KEY = "news-radar-test-key";
const BASE = "http://localhost:3001/api/admin/news-radar";
const AUTH = { Authorization: `Bearer ${KEY}` };
const OCT = new Date("2026-10-05T06:00:00Z");
const NOV = new Date("2026-11-23T06:00:00Z");

const found = (n: number, over: Partial<FoundItem> = {}): FoundItem => ({
  urlKey: `https://news.test/${n}`,
  titleKey: `item ${n}|news`,
  storyKey: `item ${n}`,
  url: `https://news.test/${n}`,
  title: `Item ${n}`,
  outlet: "News",
  snippet: "",
  kind: "news",
  publishedAt: null,
  sources: ["google_news"],
  topics: ["ai-litigation"],
  score: 2,
  ...over,
});

const send = (method: string, path: string, body?: unknown, headers: HeadersInit = AUTH) =>
  new Request(`${BASE}${path}`, { method, headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

async function seed() {
  const october = await startRun("schedule", null, OCT);
  await recordFound(october, OCT, [found(1, { title: "Old AI lawsuit" })]);
  const november = await startRun("schedule", null, NOV);
  await recordFound(november, NOV, [
    found(2, { title: "Chatbot lawsuit filed over AI harms", snippet: "A class action." }),
    found(3, { title: "AI lawsuit webinar announced" }),
  ]);
  const [useful] = await db.select().from(newsRadarItems).where(sql`title like 'Chatbot%'`);
  const [dismissed] = await db.select().from(newsRadarItems).where(sql`title like '%webinar%'`);
  await setItemState(useful.id, "useful", "someone@example.com");
  await setItemState(dismissed.id, "dismissed", "someone@example.com");
}


beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T12:00:00Z"));
  vi.stubEnv("NEWS_RADAR_API_KEY", KEY);
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  cookieJar.reset();
  await db.delete(adminSessions);
  await db.delete(adminAuditLog);
  await db.delete(newsRadarItems);
  await db.delete(newsRadarRuns);
  await db.delete(newsRadarSettings);
});

describe("who may use it", () => {
  it("refuses a request with no key, a wrong key, or when no key is configured", async () => {
    for (const headers of [{}, { Authorization: "Bearer wrong" }] as HeadersInit[]) {
      expect((await getItems(send("GET", "/items", undefined, headers))).status).toBe(401);
      expect((await getSettings(send("GET", "/settings", undefined, headers))).status).toBe(401);
      expect((await putSettings(send("PUT", "/settings", DEFAULT_SETTINGS, headers))).status).toBe(401);
      expect((await rescore(send("POST", "/rescore", DEFAULT_SETTINGS, headers))).status).toBe(401);
    }
    vi.stubEnv("NEWS_RADAR_API_KEY", "");
    expect((await getItems(send("GET", "/items", undefined, { Authorization: "Bearer " }))).status).toBe(401);
    vi.stubEnv("OPPORTUNITIES_API_KEY", "other-key");
    expect((await getItems(send("GET", "/items", undefined, { Authorization: "Bearer other-key" }))).status).toBe(401);
  });

  it("lets a signed-in admin in without the key", async () => {
    await startAdminSession({ email: "admin@example.com", name: "Admin" });
    expect((await getSettings(send("GET", "/settings", undefined, {}))).status).toBe(200);
  });
});

describe("GET /items", () => {
  it("exports items since a day with their triage state and matched keywords, never who triaged them", async () => {
    await seed();
    const response = await getItems(send("GET", "/items?since=2026-11-01"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ since: "2026-11-01T00:00:00.000Z", truncated: false });
    expect(body.items.map((i: { title: string; state: string }) => [i.title, i.state]).sort()).toEqual([
      ["AI lawsuit webinar announced", "dismissed"],
      ["Chatbot lawsuit filed over AI harms", "useful"],
    ]);
    const useful = body.items.find((i: { state: string }) => i.state === "useful");
    expect(useful.matched).toEqual([{ topic: "ai-litigation", keywords: ["lawsuit", "class action"] }]);
    expect(useful.triagedAt).toBe("2026-11-27T12:00:00.000Z");
    expect(JSON.stringify(body)).not.toContain("someone@example.com");
  });

  it("looks back 90 days by default, and refuses a bad day", async () => {
    await seed();
    const body = await (await getItems(send("GET", "/items"))).json();
    expect(body.items).toHaveLength(3);
    const bad = await getItems(send("GET", "/items?since=yesterday"));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "since must be a day, as YYYY-MM-DD." });
  });
});

describe("/settings", () => {
  it("gives the topics and outlets but not the recipient", async () => {
    await saveNewsRadarSettings({ ...DEFAULT_SETTINGS, recipient: "team@example.com" }, "admin@example.com");
    const body = await (await getSettings(send("GET", "/settings"))).json();
    expect(body.topics).toEqual(DEFAULT_SETTINGS.topics);
    expect(body.trustedOutlets).toEqual(DEFAULT_SETTINGS.trustedOutlets);
    expect(JSON.stringify(body)).not.toContain("team@example.com");
    expect(body).not.toHaveProperty("recipient");
  });

  it("replaces the topics and outlets, keeps the recipient, and audits the change as the agent", async () => {
    await saveNewsRadarSettings({ ...DEFAULT_SETTINGS, recipient: "team@example.com" }, "admin@example.com");
    const topics = [{ name: "Only topic", queries: ["q"], include: ["lawsuit"], require: [], exclude: [] }];
    const response = await putSettings(send("PUT", "/settings", { topics, trustedOutlets: ["Reuters"] }));
    expect(response.status).toBe(200);
    expect((await response.json()).topics).toEqual([{ ...topics[0], id: "only-topic" }]);

    const saved = await getNewsRadarSettings();
    expect(saved).toMatchObject({ topics: [{ id: "only-topic" }], trustedOutlets: ["Reuters"], recipient: "team@example.com", updatedBy: "news-radar@api" });
    const audit = await db.select().from(adminAuditLog);
    expect(audit).toEqual([expect.objectContaining({ actorEmail: "news-radar@api", action: "news_radar_settings", detail: { topics: ["only-topic"], recipientChanged: false } })]);
  });

  it("refuses a recipient, or settings the form would refuse, and saves nothing", async () => {
    for (const body of [{ ...DEFAULT_SETTINGS, recipient: "x@example.com" }, { topics: [], trustedOutlets: [] }, "not an object"]) {
      const response = await putSettings(send("PUT", "/settings", body));
      expect(response.status).toBe(400);
    }
    expect((await getNewsRadarSettings()).updatedBy).toBeNull();
    expect(await db.select().from(adminAuditLog)).toEqual([]);
  });
});

describe("POST /rescore", () => {
  it("judges proposed settings against the team's triage without saving them", async () => {
    await seed();
    const proposed = {
      topics: DEFAULT_SETTINGS.topics.map((t) => (t.id === "ai-litigation" ? { ...t, exclude: [...t.exclude, "webinar"] } : t)),
      trustedOutlets: DEFAULT_SETTINGS.trustedOutlets,
      since: "2026-11-01",
    };
    const response = await rescore(send("POST", "/rescore", proposed));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.summary).toEqual({
      useful: { total: 1, keptNow: 1, keptProposed: 1 },
      dismissed: { total: 1, keptNow: 1, keptProposed: 0 },
      new: { total: 0, keptNow: 0, keptProposed: 0 },
    });
    expect(body.items.find((i: { state: string }) => i.state === "dismissed").change).toBe("newly dropped");
    expect((await getNewsRadarSettings()).updatedBy).toBeNull();
    expect(await db.select().from(adminAuditLog)).toEqual([]);
  });

  it("refuses a bad body or day", async () => {
    expect((await rescore(send("POST", "/rescore", { ...DEFAULT_SETTINGS, since: "soon" }))).status).toBe(400);
    expect((await rescore(send("POST", "/rescore", { topics: [] }))).status).toBe(400);
    expect((await rescore(send("POST", "/rescore", [1]))).status).toBe(400);
  });
});
