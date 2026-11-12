import { SITE_URL } from "@/cms/site";
import { isProductionDeploy } from "@/lib/deploy-context";

/**
 * IndexNow tells Bing, Yandex, Seznam, Naver and the other engines that take part that a URL
 * has changed, so they recrawl it sooner than the sitemap alone would get them to. Google does
 * not take part. One POST to the shared endpoint reaches every engine.
 *
 * The key proves the site is ours: it is served as plain text at `INDEXNOW_KEY_PATH` (see
 * src/app/indexnow-key.txt/route.ts), and each request names that file as `keyLocation`.
 * Pings go out only from the production deploy, with `INDEXNOW_KEY` set, so a preview or
 * local run never announces URLs it doesn't serve.
 *
 * A ping is a courtesy, never part of the change itself: it can't fail the write that caused
 * it, and is given up after `REQUEST_TIMEOUT_MS`. A missed ping costs only a slower recrawl.
 */

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_KEY_PATH = "/indexnow-key.txt";
export const REQUEST_TIMEOUT_MS = 5000;

/** The protocol's rule for a key: 8 to 128 letters, digits and dashes. */
const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

/** The site's key, or null when it is unset or not a key IndexNow would accept. */
export function indexNowKey(): string | null {
  const key = process.env.INDEXNOW_KEY?.trim();
  return key && KEY_PATTERN.test(key) ? key : null;
}

/**
 * Asks the engines to recrawl `paths` (site paths such as `/opportunities/x`). Does nothing off
 * the production deploy or without a key, and never throws.
 */
export async function notifyIndexNow(paths: string[]): Promise<void> {
  const key = indexNowKey();
  if (!key || !isProductionDeploy() || paths.length === 0) return;

  const urlList = [...new Set(paths)].map((path) => new URL(path, SITE_URL).href);
  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(SITE_URL).host,
        key,
        keyLocation: new URL(INDEXNOW_KEY_PATH, SITE_URL).href,
        urlList,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`[indexnow] Ping refused: ${response.status} ${await response.text()}`);
    }
  } catch (e) {
    console.error("[indexnow] Ping failed", e);
  }
}
