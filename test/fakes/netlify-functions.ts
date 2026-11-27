import { RUN_FUNCTION_PATH } from "@/news-radar/start";
import { route } from "./network";

/**
 * Stands in for Netlify's side of the News radar's background function: a POST to the deploy's
 * own `/.netlify/functions/news-radar-run` runs the real function (netlify/functions/
 * news-radar-run.mts), with the deploy context Netlify would give it, and answers 202 as Netlify
 * does. Unlike Netlify, it answers only once the function has finished, so a test can look at
 * the result straight after. A test points the app here with `vi.stubEnv("DEPLOY_ORIGIN",
 * DEPLOY_ORIGIN)`; `failNext(status)` makes Netlify refuse the next call instead.
 */

export const DEPLOY_ORIGIN = "https://deploy.lawforaisafety.test";

class FakeNetlifyFunctions {
  /** What each call to the function answered, in order. */
  readonly answers: { status: number; body: string }[] = [];
  private refuseWith: number | null = null;

  reset(): void {
    this.answers.length = 0;
    this.refuseWith = null;
  }

  failNext(status: number): void {
    this.refuseWith = status;
  }

  async handle(request: Request): Promise<Response> {
    if (this.refuseWith !== null) {
      const status = this.refuseWith;
      this.refuseWith = null;
      return new Response("Refused", { status });
    }
    const { default: newsRadarRun } = await import("../../netlify/functions/news-radar-run.mjs");
    const answer = await newsRadarRun(request, { deploy: { context: process.env.DEPLOY_CONTEXT } });
    this.answers.push({ status: answer.status, body: await answer.text() });
    return new Response(null, { status: 202 });
  }
}

export const netlifyFunctions = new FakeNetlifyFunctions();
route(`${DEPLOY_ORIGIN}${RUN_FUNCTION_PATH}`, (request) => netlifyFunctions.handle(request));
