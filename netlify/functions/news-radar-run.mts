/**
 * Netlify background function: runs one News radar run, which can take minutes (GDELT turns
 * requests away when busy). Netlify answers the caller 202 at once and gives this up to 15
 * minutes. Started by startNewsRadarRun (src/news-radar/start.ts), for the weekly run and for
 * "Run now", which posts the run's id with the shared CRON_SECRET; the work itself is
 * handleRunRequest, next to the code it depends on.
 *
 * Code here runs outside Next, which inlines DEPLOY_CONTEXT into its own code at build time
 * (src/lib/deploy-context.ts), so it is set from Netlify's runtime context instead: the weekly
 * email goes out from production only.
 */
import { handleRunRequest } from "../../src/news-radar/start";

type NetlifyContext = { deploy?: { context?: string } };

export default async function newsRadarRun(request: Request, context: NetlifyContext): Promise<Response> {
  process.env.DEPLOY_CONTEXT ??= context.deploy?.context ?? "";
  return handleRunRequest(request);
}

export const config = { background: true };
