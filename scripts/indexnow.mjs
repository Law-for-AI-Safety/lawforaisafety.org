// Submits the public pages changed by a push to IndexNow (Bing, DuckDuckGo,
// Yahoo). Only pages that are both changed and listed in the live sitemap are
// submitted, and only once the live site serves them, so a deploy that is
// still building does not send 404s.
//
// Usage: node scripts/indexnow.mjs <before-sha> <after-sha> [--dry-run]

import { execFileSync } from "node:child_process";

const SITE = "https://lawforaisafety.org";
const HOST = "lawforaisafety.org";
const KEY = "74592580df5c491543b27c8479e59566";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const POLL_INTERVAL_MS = 30_000;
const POLL_TIMEOUT_MS = 15 * 60_000;

// Route folders that are not public pages, or are behind the apply flow.
const EXCLUDED_PREFIXES = [
  "admin",
  "api",
  "apply",
  "newsletter",
  "og-assets",
  "red-lines-dialogue/confirm",
  "red-lines-dialogue/retry",
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const [before, after] = args.filter((arg) => arg !== "--dry-run");

if (!after) {
  console.error("usage: node scripts/indexnow.mjs <before-sha> <after-sha> [--dry-run]");
  process.exit(1);
}

function routeFor(file) {
  if (file === "src/app/page.tsx") return "";
  const match = file.match(/^src\/app\/(.+)\/page\.tsx$/);
  if (!match) return null;
  const route = match[1];
  if (route.includes("[") || route.includes("(")) return null;
  if (EXCLUDED_PREFIXES.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))) {
    return null;
  }
  return route;
}

function changedRoutes() {
  if (!before || /^0+$/.test(before)) return [];
  const files = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=AM", before, after, "--", "src/app"],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);
  return [...new Set(files.map(routeFor).filter((route) => route !== null))];
}

async function sitemapUrls() {
  const res = await fetch(`${SITE}/sitemap.xml`);
  if (!res.ok) throw new Error(`sitemap.xml returned ${res.status}`);
  const xml = await res.text();
  return new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
}

async function isLive(url) {
  try {
    const res = await fetch(url, { redirect: "manual" });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function waitUntilReady(url) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await sitemapUrls()).has(url) && (await isLive(url))) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return false;
}

const routes = changedRoutes();
if (routes.length === 0) {
  console.log("No public pages changed in this push. Nothing to submit.");
  process.exit(0);
}

const candidates = routes.map((route) => (route === "" ? SITE : `${SITE}/${route}`));

const ready = [];
for (const url of candidates) {
  if (dryRun) {
    if ((await sitemapUrls()).has(url)) ready.push(url);
    else console.log(`Would skip ${url}: not in sitemap.xml yet`);
    continue;
  }
  if (await waitUntilReady(url)) {
    ready.push(url);
  } else {
    console.error(`Not live and in sitemap after ${POLL_TIMEOUT_MS / 60_000} minutes, not submitting: ${url}`);
  }
}

if (ready.length === 0) {
  console.error("None of the changed pages are live. Nothing submitted.");
  process.exit(1);
}

const body = {
  host: HOST,
  key: KEY,
  keyLocation: `${SITE}/${KEY}.txt`,
  urlList: ready,
};

if (dryRun) {
  console.log("Dry run. Would submit:");
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
}

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

console.log(`IndexNow responded ${res.status} for ${ready.length} URL(s).`);
if (!res.ok) {
  console.error(await res.text());
  process.exit(1);
}
