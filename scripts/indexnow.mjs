// Submits the public pages changed by a push to IndexNow (Bing, DuckDuckGo,
// Yahoo). Only pages that are both changed and listed in the live sitemap are
// submitted, and only once the live site serves them, so a deploy that is
// still building does not send 404s.
//
// A page changes either through its route file (src/app/**/page.tsx) or through its content
// file (content/<slug>.json, served at /<slug>, or / for content/home.json). Files in content/
// whose names start with `_` are site settings, not pages.
//
// Usage: node scripts/indexnow.mjs <before-sha> <after-sha> [--dry-run]
// (or npm run indexnow:dry-run -- <before-sha> <after-sha>)

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

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

const HOME_SLUG = "home";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The route (no leading slash, "" for the homepage) a changed file is the page of, or null. */
export function routeFor(file) {
  const content = file.match(/^content\/([^/]+)\.json$/);
  if (content) {
    const slug = content[1];
    if (slug === HOME_SLUG) return "";
    return SLUG.test(slug) ? slug : null;
  }
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

/** The routes of the pages added or changed between two commits. */
export function changedRoutes(before, after, cwd) {
  if (!before || /^0+$/.test(before)) return [];
  const files = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=AM", before, after, "--", "src/app", "content"],
    { encoding: "utf8", cwd },
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

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const [before, after] = args.filter((arg) => arg !== "--dry-run");

  if (!after) {
    console.error("usage: node scripts/indexnow.mjs <before-sha> <after-sha> [--dry-run]");
    process.exit(1);
  }

  const routes = changedRoutes(before, after);
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
