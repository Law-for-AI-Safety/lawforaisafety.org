/**
 * Netlify scheduled function: every 6 hours, asks the app to delete data past
 * its retention period. All the logic lives in the Next route it calls
 * (src/app/api/cron/sweep/route.ts) — this file is only the clock, so the
 * queries stay next to the schema they depend on.
 *
 * Sweeps also run opportunistically on form submits, so this is a backstop
 * for quiet periods, not the only thing enforcing retention. Worst case on a
 * silent site, this pushes draft/CV deletion to ~30h after the stated 24h —
 * see src/app/privacy-policy/content/en.tsx — rather than the ~25h hourly
 * gave. Tighten the schedule again if that gap needs closing.
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
  schedule: "0 */6 * * *",
};
