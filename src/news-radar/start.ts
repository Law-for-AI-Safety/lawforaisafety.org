import { z } from "zod";
import { deployOrigin, isNetlifyDeploy } from "@/lib/deploy-context";
import { claimRun, finishRun, latestRuns, startRun, type NewsRadarRun } from "@/lib/news-radar-store";
import { hasBearerSecret } from "@/lib/timing-safe-equal";
import { failureReason, runNewsRadar, type RunResult } from "./run";
import { isRunning } from "./view";

/**
 * Starting a News radar run, weekly or by hand. A run can take minutes (GDELT turns requests away
 * when busy), longer than a Netlify function answering a request may take, so on Netlify the run
 * happens in a background function, which has 15 minutes: this makes the run's row, so the admin
 * page shows it running at once, and hands it to netlify/functions/news-radar-run.mts. Off
 * Netlify (local dev, tests) there is no time limit, and the run happens here.
 */

export const RUN_FUNCTION_PATH = "/.netlify/functions/news-radar-run";

/** The latest run, when it is still going. */
export async function runInProgress(now = new Date()): Promise<NewsRadarRun | null> {
  const [latest] = await latestRuns(1);
  return latest && isRunning(latest, now) ? latest : null;
}

export type StartOptions = { trigger: NewsRadarRun["trigger"]; triggeredBy?: string | null; sendDigest?: boolean; now?: Date };

/** Starts a run and returns its id. Its result is recorded on its row when it finishes. */
export async function startNewsRadarRun(options: StartOptions): Promise<{ runId: string }> {
  const now = options.now ?? new Date();
  const sendDigest = options.sendDigest ?? options.trigger === "schedule";
  const runId = await startRun(options.trigger, options.triggeredBy ?? null, now);
  if (!isNetlifyDeploy()) {
    // runNewsRadar records its own failure on the run's row, which is where the page reads it.
    await runNewsRadar({ trigger: options.trigger, runId, sendDigest, now }).catch((err) => console.error("[news-radar] Run failed", err));
    return { runId };
  }
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new Error("CRON_SECRET is not set");
    const response = await fetch(`${deployOrigin()}${RUN_FUNCTION_PATH}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ runId, sendDigest }),
    });
    // A background function answers 202 as soon as Netlify has accepted the work.
    if (response.status !== 202) throw new Error(`the background function answered HTTP ${response.status}`);
  } catch (err) {
    console.error("[news-radar] Could not start the background run", err);
    await finishRun(runId, { sources: [], newCount: 0, seenCount: 0, email: null, error: `Could not start the run: ${failureReason(err)}` });
    throw err;
  }
  return { runId };
}

const RunRequest = z.object({ runId: z.uuid(), sendDigest: z.boolean() });

/**
 * The background function's work: runs the run startNewsRadarRun made. It answers only once the
 * run is over, and never with an error, since Netlify retries a background function that fails.
 * Each run is taken on once (claimRun), so a retry after Netlify stopped the function at its
 * time limit, or a second delivery, never runs and emails it again.
 */
export async function handleRunRequest(request: Request): Promise<Response> {
  if (!hasBearerSecret(request, process.env.CRON_SECRET)) return new Response("Unauthorized", { status: 401 });
  const parsed = RunRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const run = await claimRun(parsed.data.runId);
  if (!run) {
    console.error(`[news-radar] Run ${parsed.data.runId} is unknown or already taken on; not running it again`);
    return new Response("Nothing to run", { status: 200 });
  }
  let result: RunResult | null = null;
  try {
    result = await runNewsRadar({ trigger: run.trigger, triggeredBy: run.triggeredBy, runId: run.id, sendDigest: parsed.data.sendDigest });
    console.log(`[news-radar] Run finished: ${JSON.stringify(result)}`);
  } catch (err) {
    console.error("[news-radar] Run failed", err);
  }
  return Response.json({ ok: result !== null });
}
