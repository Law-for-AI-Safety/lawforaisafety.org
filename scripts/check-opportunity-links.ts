// Checks that every opportunity's apply link still resolves. Run on demand (`npm run
// check-links`) rather than as part of the test suite or check-all: it makes real network
// requests to external sites, which the project's tests never do.
//
// Usage: node --import tsx scripts/check-opportunity-links.ts

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { Opportunity } from "../src/opportunities/types";

const execFileAsync = promisify(execFile);

export type LinkCheck = { slug: string; url: string; ok: boolean; status?: number; error?: string; via?: "curl" };

// Some sites (e.g. law-ai.org) 403 a request with no browser-like User-Agent, which would
// otherwise read as a dead link when the page is actually live for a human visitor.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Matches curl's `--max-time 15` below, so a server that never replies can't hang this script forever. */
const FETCH_TIMEOUT_MS = 15_000;

/** The HTTP status `curl` got for a URL, or null if the request itself failed. */
export async function curlStatus(url: string, run: typeof execFileAsync = execFileAsync): Promise<number | null> {
  try {
    const { stdout } = await run("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "15", "-L", "-A", USER_AGENT, url]);
    const status = Number(stdout.trim());
    return Number.isFinite(status) && status > 0 ? status : null;
  } catch {
    return null;
  }
}

/**
 * A HEAD request, falling back to GET when the server doesn't support HEAD, and to `curl` when
 * both are rejected - some sites' bot protection blocks Node's fetch (by TLS/HTTP fingerprint,
 * not by User-Agent) while a real browser, and curl, get through fine.
 */
export async function checkLink(
  opportunity: Opportunity,
  fetchImpl: typeof fetch = fetch,
  curlCheck: typeof curlStatus = curlStatus,
): Promise<LinkCheck> {
  const { slug, applyUrl: url } = opportunity;
  try {
    let res = await fetchImpl(url, { method: "HEAD", redirect: "follow", headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.status === 405 || res.status === 501) {
      res = await fetchImpl(url, { method: "GET", redirect: "follow", headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    }
    if (res.ok) return { slug, url, ok: true, status: res.status };

    const curlResult = await curlCheck(url);
    if (curlResult !== null && curlResult >= 200 && curlResult < 400) {
      return { slug, url, ok: true, status: curlResult, via: "curl" };
    }
    return { slug, url, ok: false, status: res.status };
  } catch (err) {
    const curlResult = await curlCheck(url);
    if (curlResult !== null && curlResult >= 200 && curlResult < 400) {
      return { slug, url, ok: true, status: curlResult, via: "curl" };
    }
    return { slug, url, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function checkAllLinks(
  opportunities: Opportunity[],
  fetchImpl: typeof fetch = fetch,
  curlCheck: typeof curlStatus = curlStatus,
): Promise<LinkCheck[]> {
  return Promise.all(opportunities.map((o) => checkLink(o, fetchImpl, curlCheck)));
}

/**
 * Opportunities are DB-backed now, so `getOpportunities` needs `DATABASE_URL` set before
 * `src/lib/db.ts` is first imported - which a static import of it would do before this script's
 * own code ever runs. A dynamic import, after loading `.env.local` here, defers that.
 */
async function main() {
  const ENV_FILE = ".env.local";
  if (!process.env.DATABASE_URL && existsSync(ENV_FILE)) {
    const match = readFileSync(ENV_FILE, "utf8").match(/^DATABASE_URL=(.*)$/m);
    if (match) process.env.DATABASE_URL = match[1].replace(/^"(.*)"$/, "$1");
  }
  const { getOpportunities } = await import("../src/opportunities/data");
  const results = await checkAllLinks(await getOpportunities());
  for (const r of results) {
    const via = r.via ? ` (via ${r.via})` : "";
    console.log(`${r.ok ? "OK  " : "DEAD"} ${r.status ?? r.error}${via} ${r.slug} -> ${r.url}`);
  }
  const dead = results.filter((r) => !r.ok);
  if (dead.length) {
    console.error(`\n${dead.length} dead link(s).`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} apply link(s) are live.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
