import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { newsRadarItems, newsRadarRuns, newsRadarSettings } from "@/drizzle/schema";
import { claimRun, EMAIL_SENT, getRun, saveNewsRadarSettings, startRun } from "@/lib/news-radar-store";
import { emails } from "../../test/fakes/email";
import { DEPLOY_ORIGIN, netlifyFunctions } from "../../test/fakes/netlify-functions";
import { newsSources, type FakeArticle } from "../../test/fakes/news-sources";
import { DEFAULT_SETTINGS } from "./defaults";
import { setRunSleep } from "./run";
import { handleRunRequest, RUN_FUNCTION_PATH, runInProgress, startNewsRadarRun } from "./start";
import { RUN_STALE_MS } from "./view";

/**
 * Starting a run: here when off Netlify, and on Netlify through the background function, which
 * the fake runs for real (test/fakes/netlify-functions.ts). Runs wait between requests without
 * taking any time (setRunSleep).
 */

const GROUP = "news-digest@lais.test";
const FINE: FakeArticle = {
  title: "Regulator issues first AI Act fine after market surveillance probe",
  url: "https://www.reuters.com/tech/ai-act-fine",
  outlet: "Reuters",
  date: "2026-11-26T10:00:00Z",
};

const onNetlify = (context = "deploy-preview") => {
  vi.stubEnv("DEPLOY_CONTEXT", context);
  vi.stubEnv("DEPLOY_ORIGIN", DEPLOY_ORIGIN);
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
};

/** Storing items fails while `run` runs, as when the database refuses a write. */
async function withItemsUnwritable<T>(run: () => Promise<T>): Promise<T> {
  await db.execute("alter table news_radar_items rename column title to title_gone");
  try {
    return await run();
  } finally {
    await db.execute("alter table news_radar_items rename column title_gone to title");
  }
}

const call = (body: unknown, secret = "test-cron-secret") =>
  handleRunRequest(
    new Request(`${DEPLOY_ORIGIN}${RUN_FUNCTION_PATH}`, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, body: JSON.stringify(body) }),
  );

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  setRunSleep(async () => {});
  await db.delete(newsRadarItems);
  await db.delete(newsRadarRuns);
  await db.delete(newsRadarSettings);
});

afterEach(() => setRunSleep());

describe("off Netlify", () => {
  it("runs here and returns once the run is over", async () => {
    newsSources.googleNews(FINE, "AI Act");
    const { runId } = await startNewsRadarRun({ trigger: "manual", triggeredBy: "tech@example.com" });
    expect(await getRun(runId)).toMatchObject({ trigger: "manual", triggeredBy: "tech@example.com", newCount: 1, email: null, finishedAt: expect.any(Date) });
    expect(netlifyFunctions.answers).toEqual([]);
  });

  it("records a run that fails on its row, where the page reads it", async () => {
    newsSources.googleNews(FINE, "AI Act");
    const { runId } = await withItemsUnwritable(() => startNewsRadarRun({ trigger: "manual" }));
    expect((await getRun(runId))?.error).toMatch(/title/);
  });
});

describe("on Netlify", () => {
  it("hands the run to the background function, which runs it and records the result", async () => {
    onNetlify();
    newsSources.googleNews(FINE, "AI Act");
    const { runId } = await startNewsRadarRun({ trigger: "manual", triggeredBy: "tech@example.com" });
    expect(netlifyFunctions.answers).toEqual([{ status: 200, body: JSON.stringify({ ok: true }) }]);
    expect(await getRun(runId)).toMatchObject({ trigger: "manual", triggeredBy: "tech@example.com", newCount: 1, email: null, finishedAt: expect.any(Date) });
  });

  it("sends the weekly email from production, the deploy context coming from Netlify", async () => {
    onNetlify("production");
    await saveNewsRadarSettings({ ...DEFAULT_SETTINGS, recipient: GROUP }, "tech@example.com");
    newsSources.googleNews(FINE, "AI Act");
    const { runId } = await startNewsRadarRun({ trigger: "schedule" });
    expect((await getRun(runId))?.email).toBe(EMAIL_SENT);
    expect(emails.to(GROUP)[0].html).toContain(FINE.title);
  });

  it("emails a run by hand only when asked", async () => {
    onNetlify("production");
    await saveNewsRadarSettings({ ...DEFAULT_SETTINGS, recipient: GROUP }, "tech@example.com");
    await startNewsRadarRun({ trigger: "manual" });
    expect(emails.sent).toEqual([]);
    const { runId } = await startNewsRadarRun({ trigger: "manual", sendDigest: true });
    expect((await getRun(runId))?.email).toBe(EMAIL_SENT);
    expect(emails.to(GROUP)).toHaveLength(1);
  });

  it("records the run as failed when Netlify will not start the function", async () => {
    onNetlify();
    netlifyFunctions.failNext(503);
    await expect(startNewsRadarRun({ trigger: "manual" })).rejects.toThrow("the background function answered HTTP 503");
    const [run] = await db.select().from(newsRadarRuns);
    expect(run).toMatchObject({ error: "Could not start the run: the background function answered HTTP 503", finishedAt: expect.any(Date) });
  });

  it("records the run as failed when the shared secret is not set", async () => {
    onNetlify();
    vi.stubEnv("CRON_SECRET", "");
    await expect(startNewsRadarRun({ trigger: "manual" })).rejects.toThrow("CRON_SECRET is not set");
    expect((await db.select().from(newsRadarRuns))[0].error).toBe("Could not start the run: CRON_SECRET is not set");
  });
});

describe("the background function", () => {
  it("refuses a request without the secret, or that is not a run's id", async () => {
    const runId = await startRun("manual", null, new Date());
    expect((await call({ runId, sendDigest: false }, "wrong")).status).toBe(401);
    expect((await call({ runId: "nope", sendDigest: false })).status).toBe(400);
    expect((await handleRunRequest(new Request(`${DEPLOY_ORIGIN}${RUN_FUNCTION_PATH}`, { method: "POST", headers: { Authorization: "Bearer test-cron-secret" }, body: "{" }))).status).toBe(400);
    expect(newsSources.requests).toEqual([]);
    expect((await getRun(runId))?.finishedAt).toBeNull();
  });

  it("never runs a run twice, or one it does not know", async () => {
    const runId = await startRun("manual", null, new Date());
    expect(await (await call({ runId, sendDigest: false })).json()).toEqual({ ok: true });
    const asked = newsSources.requests.length;
    expect(await (await call({ runId, sendDigest: false })).text()).toBe("Nothing to run");
    // Taken on but never finished, as when Netlify stops the function at its time limit and retries it.
    const stopped = await startRun("manual", null, new Date());
    await claimRun(stopped);
    expect(await (await call({ runId: stopped, sendDigest: true })).text()).toBe("Nothing to run");
    expect((await getRun(stopped))?.finishedAt).toBeNull();
    expect(await (await call({ runId: "00000000-0000-4000-8000-000000000000", sendDigest: false })).text()).toBe("Nothing to run");
    expect(newsSources.requests).toHaveLength(asked);
  });

  it("answers without an error when the run fails, so Netlify does not retry it", async () => {
    const runId = await startRun("manual", null, new Date());
    newsSources.googleNews(FINE, "AI Act");
    const answer = await withItemsUnwritable(() => call({ runId, sendDigest: false }));
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ ok: false });
    expect((await getRun(runId))?.error).toMatch(/title/);
  });
});

describe("runInProgress", () => {
  it("is the latest run while it is unfinished and recent", async () => {
    const now = new Date("2026-11-30T06:00:00Z");
    expect(await runInProgress(now)).toBeNull();
    const runId = await startRun("manual", null, now);
    expect((await runInProgress(new Date(now.getTime() + 60_000)))?.id).toBe(runId);
    expect(await runInProgress(new Date(now.getTime() + RUN_STALE_MS))).toBeNull();
  });
});
