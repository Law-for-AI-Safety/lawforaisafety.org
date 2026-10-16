import { isNetlifyDeploy } from "../lib/deploy-context";
import type { GitHubConfig } from "./github";

/**
 * Where publishing sends pages, read from the environment. Without the GitHub App's settings,
 * publishing is "not set up" and the editor says so; nothing else changes.
 *
 * - `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY` (PEM; `\n` escapes
 *   are accepted for hosts that keep a value on one line)
 * - `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`
 * - `GITHUB_API_URL` (optional): only `https://api.github.com`. The end-to-end tests point it
 *   at a fake on this machine (http://localhost or 127.0.0.1), which is accepted only with
 *   `CMS_TEST_LOCAL_GITHUB=1` and never on a Netlify deploy.
 * - `CMS_PREVIEW_SITE_NAME` (optional): the Netlify site whose deploy previews the pull
 *   request links to
 */

export const REQUIRED_GITHUB_ENV = [
  "GITHUB_APP_ID",
  "GITHUB_APP_INSTALLATION_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_REPO_OWNER",
  "GITHUB_REPO_NAME",
] as const;

export const DEFAULT_GITHUB_API_URL = "https://api.github.com";
/** The Netlify site this repo deploys to; its previews are `deploy-preview-<N>--<site>.netlify.app`. */
export const DEFAULT_PREVIEW_SITE_NAME = "law-for-ai-safety-org";
/** The branch pages are published to. */
export const MAIN_BRANCH = "main";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type GitHubSetup = { ok: true; config: GitHubConfig } | { ok: false; problem: string };

type Env = Record<string, string | undefined>;

/** The API URL to use, or null when the configured one is not allowed. */
function apiUrl(env: Env): string | null {
  const raw = env.GITHUB_API_URL?.trim() || DEFAULT_GITHUB_API_URL;
  if (raw.replace(/\/+$/, "") === DEFAULT_GITHUB_API_URL) return DEFAULT_GITHUB_API_URL;
  if (env.CMS_TEST_LOCAL_GITHUB !== "1" || isNetlifyDeploy()) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const local = url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname) && url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
  return local ? url.origin : null;
}
export function gitHubSetup(env: Env = process.env): GitHubSetup {
  const value = (name: string) => (env[name] ?? "").trim();
  const missing = REQUIRED_GITHUB_ENV.filter((name) => !value(name));
  if (missing.length) return { ok: false, problem: `Missing ${missing.join(", ")}` };
  const url = apiUrl(env);
  if (!url) return { ok: false, problem: `GITHUB_API_URL must be ${DEFAULT_GITHUB_API_URL}` };
  return {
    ok: true,
    config: {
      appId: value("GITHUB_APP_ID"),
      installationId: value("GITHUB_APP_INSTALLATION_ID"),
      privateKey: value("GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n"),
      owner: value("GITHUB_REPO_OWNER"),
      repo: value("GITHUB_REPO_NAME"),
      apiUrl: url,
    },
  };
}

/** The deploy preview of pull request `number`, opened at a page's path. */
export function previewUrl(number: number, pagePath: string, env: Env = process.env): string {
  const configured = env.CMS_PREVIEW_SITE_NAME?.trim() ?? "";
  // A Netlify site name is one DNS label.
  const site = /^[a-z0-9][a-z0-9-]{0,62}$/.test(configured) ? configured : DEFAULT_PREVIEW_SITE_NAME;
  return `https://deploy-preview-${number}--${site}.netlify.app${pagePath}`;
}
