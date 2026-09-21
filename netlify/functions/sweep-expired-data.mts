/**
 * Netlify scheduled function: once an hour, asks the app to delete data past
 * its retention period. All the logic lives in the Next route it calls
 * (src/app/api/cron/sweep/route.ts) — this file is only the clock, so the
 * queries stay next to the schema they depend on.
 *
 * Runs on the published production deploy only; deploy previews never fire
 * it. Netlify sets `URL` to the site's primary address at runtime.
 */
async function sweepExpiredData(): Promise<void> {
  const siteUrl = process.env.URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.CRON_SECRET;

  if (!siteUrl || !secret) {
    console.error("[cron] Sweep skipped: URL or CRON_SECRET is not set");
    return;
  }

  const response = await fetch(`${siteUrl}/api/cron/sweep`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });

  if (!response.ok) {
    // Thrown so the run shows as failed in Netlify's function log.
    throw new Error(`[cron] Sweep failed: ${response.status} ${await response.text()}`);
  }
  console.log(`[cron] Sweep done: ${await response.text()}`);
}

export default sweepExpiredData;

export const config = {
  schedule: "@hourly",
};
