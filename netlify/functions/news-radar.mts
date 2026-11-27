/**
 * Netlify scheduled function: every Monday at 06:00 UTC, asks the app to run the News radar.
 * As with sweep-expired-data.mts, this file is only the clock; the run itself lives in the Next
 * route it calls (src/app/api/cron/news-radar/route.ts), next to the code it depends on. A
 * separate function rather than a branch in the sweep, so each keeps its own schedule and its
 * own line in Netlify's function log.
 *
 * Runs on the published production deploy only; deploy previews never fire it. Netlify sets
 * `URL` to the site's primary address at runtime.
 */
async function runNewsRadar(): Promise<void> {
  const siteUrl = process.env.URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.CRON_SECRET;

  if (!siteUrl || !secret) {
    console.error("[cron] News radar skipped: URL or CRON_SECRET is not set");
    return;
  }

  const response = await fetch(`${siteUrl}/api/cron/news-radar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });

  if (!response.ok) {
    // Thrown so the run shows as failed in Netlify's function log.
    throw new Error(`[cron] News radar failed: ${response.status} ${await response.text()}`);
  }
  console.log(`[cron] News radar done: ${await response.text()}`);
}

export default runNewsRadar;

export const config = {
  schedule: "0 6 * * 1",
};
