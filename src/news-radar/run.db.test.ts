import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsRadarItems, newsRadarRuns, newsRadarSettings } from "@/drizzle/schema";
import { EMAIL_SENT, saveNewsRadarSettings, setItemState } from "@/lib/news-radar-store";
import { emails } from "../../test/fakes/email";
import { newsSources, type FakeArticle } from "../../test/fakes/news-sources";
import { POST } from "../app/api/cron/news-radar/route";
import { DEFAULT_SETTINGS } from "./defaults";
import { runNewsRadar, setRunSleep, SOURCE_BUDGET_MS } from "./run";
import { gdelt } from "./sources/gdelt";
import { USER_AGENT } from "./sources/http";
import { SOURCES } from "./sources";

/**
 * The weekly run end to end, against a real database, with every source faked at fetch: what is
 * stored, how re-found articles keep their row and triage, sources failing alone, and the email.
 */

const GROUP = "news-digest@lais.test";
const MONDAY = new Date("2026-11-30T06:00:00Z");
const NEXT_MONDAY = new Date("2026-12-07T06:00:00Z");
const noWait = async () => {};

const FINE: FakeArticle = {
  title: "Regulator issues first AI Act fine after market surveillance probe",
  url: "https://www.reuters.com/tech/ai-act-fine?utm_source=rss&utm_medium=feed",
  outlet: "Reuters",
  date: "2026-11-27T10:00:00Z",
};
const LAWSUIT: FakeArticle = {
  title: "Families sue chatbot maker in class action over AI harms",
  url: "https://example-news.test/chatbot-class-action",
  outlet: "Example News",
  date: "2026-11-26T09:00:00Z",
};
const OFF_TOPIC: FakeArticle = {
  title: "Football club signs new striker",
  url: "https://sport.test/striker",
  outlet: "Sport Daily",
  date: "2026-11-26T09:00:00Z",
};

const run = (now = MONDAY, trigger: "schedule" | "manual" = "schedule") => runNewsRadar({ trigger, now, sleep: noWait });
const items = () => db.select().from(newsRadarItems).orderBy(newsRadarItems.title);
const cron = (secret = "test-cron-secret") =>
  POST(new Request("https://lawforaisafety.test/api/cron/news-radar", { method: "POST", headers: { Authorization: `Bearer ${secret}` } }));

beforeEach(async () => {
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  await db.delete(newsRadarItems);
  await db.delete(newsRadarRuns);
  await db.delete(newsRadarSettings);
  // For runs started through the cron route, which cannot pass `sleep`.
  setRunSleep(noWait);
});

afterEach(() => setRunSleep());

async function withRecipient() {
  await saveNewsRadarSettings({ ...DEFAULT_SETTINGS, recipient: GROUP }, "tech@example.com");
}

describe("a run", () => {
  it("asks every source politely and keeps only what matches a topic", async () => {
    newsSources.googleNews(FINE, "AI Act");
    newsSources.googleNews(OFF_TOPIC);
    const result = await run();

    // The off-topic article comes back from every topic's search; FINE only from the searches naming the AI Act.
    expect(result.sources).toEqual([
      { source: "google_news", ok: true, found: 7 + 1, relevant: 1 },
      { source: "gdelt", ok: true, found: 0, relevant: 0 },
      { source: "openalex", ok: true, found: 0, relevant: 0 },
      { source: "eu_digital", ok: true, found: 0, relevant: 0 },
    ]);
    const stored = await items();
    expect(stored.map((i) => i.title)).toEqual([FINE.title]);
    expect(stored[0]).toMatchObject({
      outlet: "Reuters",
      urlKey: "https://reuters.com/tech/ai-act-fine",
      sources: ["google_news"],
      state: "new",
      firstSeenAt: MONDAY,
      lastSeenAt: MONDAY,
    });
    expect(stored[0].topics[0]).toBe("ai-act-enforcement");

    expect(newsSources.requests.every((r) => r.userAgent === USER_AGENT)).toBe(true);
    // One Google News search per topic, two GDELT queries for them all, one OpenAlex search per topic, one feed.
    expect(newsSources.to("google_news")).toHaveLength(DEFAULT_SETTINGS.topics.length);
    expect(newsSources.to("gdelt")).toHaveLength(2);
    expect(newsSources.to("openalex")).toHaveLength(DEFAULT_SETTINGS.topics.length);
    expect(newsSources.to("eu_digital")).toHaveLength(1);
    expect(newsSources.to("google_news")[0].searchParams.get("q")).toMatch(/ when:7d$/);
    expect(newsSources.to("openalex")[0].searchParams.get("filter")).toBe("from_publication_date:2026-11-23,to_publication_date:2026-11-30");
  });

  it("stores an article found by two sources once, with both sources", async () => {
    newsSources.googleNews(FINE, "AI Act");
    newsSources.gdelt({ ...FINE, url: "https://reuters.com/tech/ai-act-fine/", outlet: "reuters.com" });
    await run();
    const stored = await items();
    expect(stored).toHaveLength(1);
    expect(stored[0].sources.sort()).toEqual(["gdelt", "google_news"]);
  });

  it("reads papers from OpenAlex and the Commission's news feed", async () => {
    newsSources.openAlex(
      {
        title: "Liability for AI under the new Product Liability Directive",
        url: "https://doi.org/10.1234/pld",
        outlet: "European Law Review",
        date: "2026-11-25",
        summary: "We examine how the directive treats artificial intelligence software as a product.",
      },
      "Product Liability Directive",
    );
    newsSources.euDigital({
      title: "AI Office opens consultation on AI Act enforcement guidelines",
      url: "https://digital-strategy.ec.europa.eu/en/news/ai-office-consultation",
      outlet: "European Commission",
      date: "2026-11-24T09:00:00Z",
      summary: "The AI Office invites comments.",
    });
    newsSources.euDigital({ ...OFF_TOPIC, url: "https://digital-strategy.ec.europa.eu/en/news/quantum", title: "Quantum Act proposed" });
    await run();
    const stored = await items();
    expect(stored.map((i) => [i.title, i.kind, i.outlet])).toEqual([
      ["AI Office opens consultation on AI Act enforcement guidelines", "news", "European Commission"],
      ["Liability for AI under the new Product Liability Directive", "paper", "European Law Review"],
    ]);
    expect(stored[1].snippet).toContain("artificial intelligence software");
    expect(stored[0].snippet).toBe("The AI Office invites comments.");
  });

  it("drops a Commission item older than the week", async () => {
    newsSources.euDigital({ ...FINE, date: "2026-11-01T09:00:00Z" });
    await run();
    expect(await items()).toEqual([]);
  });
});

describe("seen before", () => {
  it("never makes a new row for an article found again, and keeps its first sighting and triage", async () => {
    newsSources.googleNews(FINE, "AI Act");
    await run();
    const [first] = await items();
    await setItemState(first.id, "useful", "admin@example.com");

    // Next week Google News links the same story with different tracking parameters.
    newsSources.reset();
    newsSources.googleNews({ ...FINE, url: "https://reuters.com/tech/ai-act-fine?utm_campaign=x&fbclid=abc" }, "AI Act");
    const second = await run(NEXT_MONDAY);

    expect(second).toMatchObject({ newCount: 0, seenCount: 1 });
    const stored = await items();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: first.id, state: "useful", firstSeenAt: MONDAY, lastSeenAt: NEXT_MONDAY, firstRunId: first.firstRunId, lastRunId: second.runId });
  });

  it("matches on title and outlet when the address cannot be compared", async () => {
    // A Google News link whose id hides the article's address: a different one each week.
    newsSources.googleNews({ ...FINE, url: "https://news.google.com/rss/articles/CBMiAU_yqLOpaque1?oc=5" }, "AI Act");
    await run();
    newsSources.reset();
    newsSources.googleNews({ ...FINE, title: "Regulator issues first AI Act fine after market-surveillance probe", url: "https://news.google.com/rss/articles/CBMiAU_yqLOpaque2?oc=5" }, "AI Act");
    await run(NEXT_MONDAY);
    expect(await items()).toHaveLength(1);
  });

  it("treats the same headline from the same outlet as a new article once the old one is weeks old", async () => {
    newsSources.googleNews(FINE, "AI Act");
    await run();
    newsSources.reset();
    const column = { ...FINE, url: "https://reuters.com/tech/ai-act-fine-again" };
    newsSources.googleNews(column, "AI Act");
    expect(await run(new Date("2026-12-28T06:00:00Z"))).toMatchObject({ newCount: 1, seenCount: 0 });
    expect(await items()).toHaveLength(2);
  });

  it("lists what a run by hand found in the next weekly email, as new", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    await withRecipient();
    await run(new Date("2026-11-23T06:00:00Z"));
    newsSources.googleNews(FINE, "AI Act");
    await run(new Date("2026-11-27T12:00:00Z"), "manual");
    emails.reset();
    await run();
    const [email] = emails.to(GROUP);
    expect(email.subject).toBe("News radar: 1 new for the week of 30 Nov 2026");
    expect(email.html).toContain(FINE.title);
    expect(email.html).not.toContain("seen before");
  });

  it("lists what a failed weekly run stored in the next weekly email", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    await withRecipient();
    newsSources.googleNews(FINE, "AI Act");
    emails.failNext();
    expect((await run()).email).toBe("Not sent: Brevo refused it. See the function log.");
    newsSources.reset();
    newsSources.googleNews(LAWSUIT, "lawsuit");
    await run(NEXT_MONDAY);
    const [email] = emails.to(GROUP);
    expect(email.subject).toBe("News radar: 2 new for the week of 7 Dec 2026");
    expect(email.html).toContain(FINE.title);
  });

  it("keeps a dismissed item dismissed and out of the email", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    await withRecipient();
    newsSources.googleNews(FINE, "AI Act");
    newsSources.googleNews(LAWSUIT, "lawsuit");
    await run();
    const fine = (await items()).find((i) => i.title === FINE.title)!;
    await setItemState(fine.id, "dismissed", "admin@example.com");
    emails.reset();

    await run(NEXT_MONDAY);
    expect((await items()).find((i) => i.id === fine.id)?.state).toBe("dismissed");
    const [email] = emails.to(GROUP);
    expect(email.html).not.toContain(FINE.title);
    expect(email.subject).toContain("nothing new");
    expect(email.html).toContain("1 item seen before was found again and is still relevant");
  });
});

describe("a source failing", () => {
  it.each(["http", "network"] as const)("costs only that source's results (%s)", async (how) => {
    newsSources.down("gdelt", how);
    newsSources.googleNews(FINE, "AI Act");
    const result = await run();
    expect(result.sources.find((s) => s.source === "gdelt")).toMatchObject({ ok: false, error: expect.any(String) });
    expect(result.sources.filter((s) => s.ok)).toHaveLength(3);
    expect(await items()).toHaveLength(1);
    const [row] = await db.select().from(newsRadarRuns);
    expect(row.sources.find((s) => s.source === "gdelt")).toMatchObject({ ok: false });
    expect(row.finishedAt).not.toBeNull();
  });

  it("stops a source that does not answer in time, and says after how long", async () => {
    newsSources.down("openalex", "hang");
    const result = await runNewsRadar({ trigger: "manual", now: MONDAY, sleep: noWait, budgetMs: 50 });
    expect(result.sources.find((s) => s.source === "openalex")).toEqual({ source: "openalex", ok: false, error: "timed out after 50ms and was stopped" });
  });

  it("asks GDELT in queries short enough for it to take, spaced apart", async () => {
    const waits: number[] = [];
    newsSources.gdelt(FINE, "ai act enforcement");
    newsSources.gdelt(LAWSUIT, "court ruling");
    const result = await runNewsRadar({ trigger: "manual", now: MONDAY, sleep: async (ms) => void waits.push(ms) });
    expect(result.sources.find((s) => s.source === "gdelt")).toEqual({ source: "gdelt", ok: true, found: 2, relevant: 2 });
    expect(newsSources.to("gdelt")).toHaveLength(2);
    expect(waits).toContain(6_000);
  });

  it("keeps asking GDELT, waiting longer each time, while it says the requests are too fast", async () => {
    const waits: number[] = [];
    newsSources.throttleGdelt(5);
    newsSources.gdelt(FINE);
    const result = await runNewsRadar({ trigger: "manual", now: MONDAY, sources: [gdelt], sleep: async (ms) => void waits.push(ms) });
    expect(newsSources.to("gdelt")).toHaveLength(7);
    expect(waits).toEqual([10_000, 20_000, 40_000, 60_000, 60_000, 6_000]);
    expect(result.sources.find((s) => s.source === "gdelt")).toMatchObject({ ok: true, relevant: 1 });
  });

  it("says GDELT was still turning requests away when it ran out of time", async () => {
    newsSources.throttleGdelt(Infinity);
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.min(ms, 5)));
    const result = await runNewsRadar({ trigger: "manual", now: MONDAY, sources: [gdelt], sleep, budgetMs: 200 });
    expect(result.sources.find((s) => s.source === "gdelt")).toEqual({
      source: "gdelt",
      ok: false,
      error: expect.stringMatching(/^timed out after 200ms and was stopped: GDELT was still turning requests away as too fast \(429\) after \d+ tries$/),
    });
  });

  it("keeps what GDELT's first query found when it runs out of time on the second", async () => {
    newsSources.throttleGdelt(Infinity, { after: 1 });
    newsSources.gdelt(FINE);
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.min(ms, 5)));
    const result = await runNewsRadar({ trigger: "manual", now: MONDAY, sources: [gdelt], sleep, budgetMs: 200 });
    expect(result.sources).toEqual([{ source: "gdelt", ok: true, found: 1, relevant: 1 }]);
    expect(newsSources.to("gdelt").length).toBeGreaterThan(2);
  });

  it("does not take an answer for the too-fast notice because an article quotes it", async () => {
    newsSources.gdelt({ ...FINE, title: "Regulators please limit requests for data after AI Act fine and market surveillance probe" });
    const result = await runNewsRadar({ trigger: "manual", now: MONDAY, sources: [gdelt], sleep: noWait });
    expect(result.sources).toEqual([{ source: "gdelt", ok: true, found: 2, relevant: 2 }]);
    expect(newsSources.to("gdelt")).toHaveLength(2);
  });

  it("gives a source that asks for it its own time", async () => {
    const hang = (id: "openalex" | "eu_digital", budgetMs: number) => ({
      id,
      label: id,
      budgetMs,
      fetch: ({ signal }: { signal: AbortSignal }) => new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason))),
    });
    const result = await runNewsRadar({ trigger: "manual", now: MONDAY, sources: [hang("openalex", 30), hang("eu_digital", 1_000)] });
    expect(result.sources).toEqual([
      { source: "openalex", ok: false, error: "timed out after 30ms and was stopped" },
      { source: "eu_digital", ok: false, error: "timed out after 1s and was stopped" },
    ]);
    expect(gdelt.budgetMs).toBeGreaterThan(SOURCE_BUDGET_MS);
  });

  it("says when GDELT refuses a query, and keeps the other query's results", async () => {
    await saveNewsRadarSettings(
      { ...DEFAULT_SETTINGS, topics: [{ ...DEFAULT_SETTINGS.topics[0], include: ["market surveillance", "x".repeat(240) + " y"] }] },
      "tech@example.com",
    );
    newsSources.gdelt(FINE);
    const kept = await run();
    expect(kept.sources.find((s) => s.source === "gdelt")).toMatchObject({ ok: true, relevant: 1 });

    await saveNewsRadarSettings({ ...DEFAULT_SETTINGS, topics: [{ ...DEFAULT_SETTINGS.topics[0], include: ["x".repeat(240) + " y"] }] }, "tech@example.com");
    const refused = await run();
    expect(refused.sources.find((s) => s.source === "gdelt")).toEqual({
      source: "gdelt",
      ok: false,
      error: "GDELT refused the query: Your query was too short or too long.",
    });
  });

  it("says when a source answers with an HTTP error or cannot be reached", async () => {
    newsSources.down("gdelt", "http");
    newsSources.down("openalex", "network");
    const result = await run();
    expect(result.sources.find((s) => s.source === "gdelt")).toEqual({ source: "gdelt", ok: false, error: "GDELT answered HTTP 503: Service Unavailable" });
    expect(result.sources.find((s) => s.source === "openalex")).toEqual({ source: "openalex", ok: false, error: "could not be reached" });
  });

  it("keeps Google News results from the topics whose search worked", async () => {
    newsSources.googleNews(FINE, "AI Act");
    newsSources.googleNews(LAWSUIT, "lawsuit");
    newsSources.failSearches("lawsuit");
    const result = await run();
    expect(result.sources[0]).toMatchObject({ source: "google_news", ok: true });
    expect((await items()).map((i) => i.title)).toEqual([FINE.title]);
  });

  it("keeps OpenAlex results from the topics whose search worked", async () => {
    newsSources.openAlex({ title: "AI liability under the Product Liability Directive", url: "https://doi.org/10.1/a", outlet: "J", date: "2026-11-25" }, "Product Liability Directive");
    newsSources.failSearches("lawsuit", "openalex");
    const result = await run();
    expect(result.sources.find((s) => s.source === "openalex")).toMatchObject({ ok: true, relevant: 1 });
  });

  it("fails OpenAlex when every topic's search fails", async () => {
    newsSources.failSearches("(", "openalex");
    const result = await run();
    expect(result.sources.find((s) => s.source === "openalex")).toMatchObject({ ok: false, error: "OpenAlex answered HTTP 503: Service Unavailable" });
  });

  it("stores a result whose text holds control characters, without them", async () => {
    // Postgres refuses a NUL character in text, so one such result would otherwise sink the run.
    newsSources.googleNews({ ...FINE, title: "AI Act fine\u0000for market sur\u00adveil\u200blance", url: "https://exa\u0000mple.com/a" }, "AI Act");
    await run();
    expect((await items()).map((i) => [i.title, i.url, i.urlKey])).toEqual([["AI Act fine for market surveillance", "https://example.com/a", "https://example.com/a"]]);
  });

  it("never stores one article twice when two runs overlap", async () => {
    // Opaque Google News links differ between the runs, so only the title can match them.
    let n = 0;
    newsSources.googleNews({ ...FINE, url: "https://news.google.com/rss/articles/CBMiAU_yqLOpaque" }, "AI Act");
    const opaque = (s: (typeof SOURCES)[number]) => ({
      ...s,
      fetch: async (context: Parameters<typeof s.fetch>[0]) =>
        (await s.fetch(context)).map((c) => ({ ...c, url: `${c.url}${++n}` })),
    });
    const sources = SOURCES.map(opaque);
    await Promise.all([
      runNewsRadar({ trigger: "schedule", now: MONDAY, sleep: noWait, sources }),
      runNewsRadar({ trigger: "manual", now: MONDAY, sleep: noWait, sources }),
    ]);
    expect(await items()).toHaveLength(1);
  });

  it("records a run that fails after the sources answered, rather than leaving it running", async () => {
    newsSources.googleNews(FINE, "AI Act");
    // A score the database cannot store makes saving the results fail.
    const scorer = () => ({ topics: ["ai-act-enforcement"], score: Number.NaN });
    await expect(runNewsRadar({ trigger: "schedule", now: MONDAY, sleep: noWait, scorer })).rejects.toThrow();
    const [row] = await db.select().from(newsRadarRuns);
    expect(row.finishedAt).not.toBeNull();
    expect(row.error).toMatch(/^invalid input syntax for type integer/);
    expect(row.error).not.toContain("insert into");
  });

  it("fails Google News when every topic's search fails", async () => {
    newsSources.failSearches("when:");
    const result = await run();
    expect(result.sources[0]).toEqual({ source: "google_news", ok: false, error: "Google News answered HTTP 503: Service Unavailable" });
  });
});

describe("the weekly email", () => {
  it("goes to the group in the settings, on production, with the new items by topic", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    await withRecipient();
    newsSources.googleNews(FINE, "AI Act");
    newsSources.googleNews(LAWSUIT, "lawsuit");
    newsSources.down("gdelt");
    const result = await run();

    expect(result.email).toBe(EMAIL_SENT);
    const [email] = emails.to(GROUP);
    expect(email.subject).toBe("News radar: 2 new for the week of 30 Nov 2026");
    expect(email.html).toContain("AI Act enforcement, fines and market surveillance");
    expect(email.html).toContain("Litigation and class actions over AI harms");
    expect(email.html).toContain(FINE.title);
    expect(email.html).toContain("GDELT failed this week.");
    expect(email.html).toContain("https://lawforaisafety.test/admin/news-radar");
  });

  it("is not sent off production", async () => {
    await withRecipient();
    newsSources.googleNews(FINE, "AI Act");
    expect((await run()).email).toBe("Not sent: only the production site sends the weekly email.");
    expect(emails.sent).toEqual([]);
  });

  it("is not sent without a recipient", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    expect((await run()).email).toBe("Not sent: no recipient is set in the News radar settings.");
    expect(emails.sent).toEqual([]);
  });

  it("is not sent for a run by hand", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    await withRecipient();
    expect((await run(MONDAY, "manual")).email).toBeNull();
    expect(emails.sent).toEqual([]);
  });

  it("is sent for a run by hand when asked", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    await withRecipient();
    newsSources.googleNews(FINE, "AI Act");
    expect((await runNewsRadar({ trigger: "manual", now: MONDAY, sleep: noWait, sendDigest: true })).email).toBe(EMAIL_SENT);
    expect(emails.to(GROUP)[0].html).toContain(FINE.title);
  });

  it("says so when Brevo refuses it, and the run still finishes", async () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    await withRecipient();
    emails.failNext();
    expect((await run()).email).toBe("Not sent: Brevo refused it. See the function log.");
    const [row] = await db.select().from(newsRadarRuns);
    expect(row.finishedAt).not.toBeNull();
  });
});

describe("the cron route", () => {
  it("refuses a request without the secret", async () => {
    expect((await cron("wrong")).status).toBe(401);
    expect(newsSources.requests).toEqual([]);
  });

  it("starts the weekly run, and answers with its id", async () => {
    newsSources.googleNews(FINE, "AI Act");
    const response = await cron();
    expect(response.status).toBe(202);
    const { runId } = await response.json();
    const [row] = await db.select().from(newsRadarRuns).where(eq(newsRadarRuns.trigger, "schedule"));
    expect(row).toMatchObject({ id: runId, newCount: 1, finishedAt: expect.any(Date) });
  });
});
