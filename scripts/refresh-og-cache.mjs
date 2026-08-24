// Forces LinkedIn's Post Inspector to re-scrape the site's og:image.
// Post Inspector requires a signed-in LinkedIn session, so this reuses a
// locally saved session instead of ever touching your password.
//
// First-time setup (or whenever the session expires):
//   node scripts/refresh-og-cache.mjs login
//   -> a real browser window opens, log in to LinkedIn yourself, then
//      press Enter in the terminal once the feed loads.
//
// Normal use:
//   node scripts/refresh-og-cache.mjs [url]
//   -> runs headlessly using the saved session.
//
// Requires: npx playwright install chromium (one-time)
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const STATE_FILE = "scripts/.linkedin-session.json"; // gitignored

if (process.argv[2] === "login") {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto("https://www.linkedin.com/login");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("Log in to LinkedIn in the opened window, then press Enter here...");
  rl.close();

  await page.context().storageState({ path: STATE_FILE });
  await browser.close();
  console.log(`Session saved to ${STATE_FILE}.`);
  process.exit(0);
}

if (!existsSync(STATE_FILE)) {
  console.error(`No saved session found. Run: node scripts/refresh-og-cache.mjs login`);
  process.exit(1);
}

const url = process.argv[2] ?? "https://lawforaisafety.org";
const inspectorUrl = `https://www.linkedin.com/post-inspector/inspect/${url.replace("://", ":%2F%2F")}`;

const browser = await chromium.launch();
const context = await browser.newContext({ storageState: STATE_FILE });
const page = await context.newPage();

console.log(`Requesting rescrape of ${url}...`);
await page.goto(inspectorUrl, { waitUntil: "load" });

if (page.url().includes("/login") || page.url().includes("/checkpoint")) {
  console.error("Session expired or challenged. Run: node scripts/refresh-og-cache.mjs login");
  await browser.close();
  process.exit(1);
}

await page.waitForSelector('[class*="preview"], [class*="error"]', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2000);

const title = await page.locator('[class*="preview-title"], h1, h2').first().textContent().catch(() => null);
const image = await page.locator('img[class*="preview"]').first().getAttribute("src").catch(() => null);

console.log("Title seen:", title?.trim() ?? "(not found)");
console.log("Image URL seen:", image ?? "(not found)");
console.log("Full report:", inspectorUrl);

await browser.close();
