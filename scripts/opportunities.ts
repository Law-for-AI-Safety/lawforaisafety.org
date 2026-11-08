// `npm run opportunities -- <command>`: the opportunities admin API from the command line, for
// admins and coding agents. It signs requests with OPPORTUNITIES_API_KEY, from the environment or
// `.env.local`, and never prints it, so an agent can list drafts and edit listings without
// handling the key. It talks to the live site unless OPPORTUNITIES_API_URL names another.
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { Opportunity } from "../src/opportunities/types";

export const DEFAULT_API_URL = "https://lawforaisafety.org";

export const USAGE = `Usage: npm run opportunities -- <command>

  list [--status draft|published]   Every listing, one line each: status, slug, title
  get <slug>                        One listing, as JSON
  create <file.json>                Creates a listing from a JSON body ("status": "draft" to keep it off the site)
  update <slug> <file.json>         Changes only the fields in the JSON body; null or "" clears one
  publish <slug>                    Publishes a draft

Talks to ${DEFAULT_API_URL} unless OPPORTUNITIES_API_URL is set.`;

export type CommandIo = {
  baseUrl: string;
  key: string;
  print: (line: string) => void;
  readFile: (path: string) => string;
};

/** Runs one command and returns the process's exit code: 0 for success, 1 for a refused request, 2 for bad usage. */
export async function runOpportunitiesCommand(args: string[], io: CommandIo): Promise<number> {
  const [command, ...rest] = args;
  const api = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${io.baseUrl}/api/admin/opportunities${path}`, {
      method,
      headers: { Authorization: `Bearer ${io.key}`, ...(body !== undefined && { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      const error = (data as { error?: unknown }).error;
      io.print(`${method} ${path || "/"} failed with ${response.status}: ${typeof error === "string" ? error : JSON.stringify(data)}`);
      return null;
    }
    return data;
  };
  const readJson = (path: string): unknown => JSON.parse(io.readFile(path));
  const printJson = (data: unknown) => io.print(JSON.stringify(data, null, 2));

  if (command === "list" && (rest.length === 0 || (rest.length === 2 && rest[0] === "--status"))) {
    const data = await api("GET", rest.length ? `?status=${encodeURIComponent(rest[1])}` : "");
    if (data === null) return 1;
    for (const o of data as Opportunity[]) io.print(`${o.status.padEnd(9)} ${o.slug}  ${o.title} (${o.org})`);
    return 0;
  }
  if (command === "get" && rest.length === 1) {
    const data = await api("GET", `/${encodeURIComponent(rest[0])}`);
    if (data === null) return 1;
    printJson(data);
    return 0;
  }
  if (command === "create" && rest.length === 1) {
    const data = await api("POST", "", readJson(rest[0]));
    if (data === null) return 1;
    printJson(data);
    return 0;
  }
  if (command === "update" && rest.length === 2) {
    const data = await api("PATCH", `/${encodeURIComponent(rest[0])}`, readJson(rest[1]));
    if (data === null) return 1;
    printJson(data);
    return 0;
  }
  if (command === "publish" && rest.length === 1) {
    const data = await api("PATCH", `/${encodeURIComponent(rest[0])}`, { status: "published" });
    if (data === null) return 1;
    printJson(data);
    return 0;
  }
  io.print(USAGE);
  return 2;
}

/** OPPORTUNITIES_API_KEY from the environment, or else from `.env.local`. */
export function apiKey(env: Record<string, string | undefined>, envFile: string | null): string | undefined {
  if (env.OPPORTUNITIES_API_KEY) return env.OPPORTUNITIES_API_KEY;
  const match = envFile?.match(/^OPPORTUNITIES_API_KEY=(.*)$/m);
  return match ? match[1].trim().replace(/^"(.*)"$/, "$1") : undefined;
}

async function main() {
  const ENV_FILE = ".env.local";
  const key = apiKey(process.env, existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : null);
  if (!key) {
    console.error("No OPPORTUNITIES_API_KEY in the environment or .env.local.");
    process.exit(2);
  }
  process.exitCode = await runOpportunitiesCommand(process.argv.slice(2), {
    baseUrl: process.env.OPPORTUNITIES_API_URL || DEFAULT_API_URL,
    key,
    print: (line) => console.log(line),
    readFile: (path) => readFileSync(path, "utf8"),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
