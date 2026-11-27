// `npm run news-radar -- <command>`: the News radar API from the command line, for an agent tuning
// the radar's topics (see news-radar-tuning.md). It signs requests with NEWS_RADAR_API_KEY, from
// the environment or `.env.local`, and never prints it. It talks to the live site unless
// NEWS_RADAR_API_URL names another.
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const DEFAULT_API_URL = "https://lawforaisafety.org";

export const USAGE = `Usage: npm run -s news-radar -- <command>

  export [--since YYYY-MM-DD]          Stored items with their triage state and matched keywords, as JSON
  settings get                         The topics and trusted outlets, as JSON
  settings put <file.json>             Replaces the topics and trusted outlets with the file's
  rescore <file.json> [--since DAY]    How stored items would score under the file's settings; saves nothing

--since defaults to the last 90 days. Talks to ${DEFAULT_API_URL} unless NEWS_RADAR_API_URL is set.`;

export type CommandIo = {
  baseUrl: string;
  key: string;
  print: (line: string) => void;
  readFile: (path: string) => string;
};

/** `--since DAY` from the end of `args`, or null when the arguments are not that shape. */
function sinceOption(args: string[]): { since?: string } | null {
  if (args.length === 0) return {};
  if (args.length === 2 && args[0] === "--since") return { since: args[1] };
  return null;
}

/** Runs one command and returns the process's exit code: 0 for success, 1 for a refused request, 2 for bad usage. */
export async function runNewsRadarCommand(args: string[], io: CommandIo): Promise<number> {
  const api = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${io.baseUrl}/api/admin/news-radar${path}`, {
      method,
      headers: { Authorization: `Bearer ${io.key}`, ...(body !== undefined && { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      const error = (data as { error?: unknown }).error;
      io.print(`${method} ${path} failed with ${response.status}: ${typeof error === "string" ? error : JSON.stringify(data)}`);
      return 1;
    }
    io.print(JSON.stringify(data, null, 2));
    return 0;
  };
  const readJson = (path: string): Record<string, unknown> => JSON.parse(io.readFile(path));

  const [command, ...rest] = args;
  if (command === "export") {
    const option = sinceOption(rest);
    if (option) return api("GET", `/items${option.since ? `?since=${encodeURIComponent(option.since)}` : ""}`);
  }
  if (command === "settings" && rest.length === 1 && rest[0] === "get") return api("GET", "/settings");
  if (command === "settings" && rest.length === 2 && rest[0] === "put") return api("PUT", "/settings", readJson(rest[1]));
  if (command === "rescore" && rest.length >= 1) {
    const option = sinceOption(rest.slice(1));
    if (option) return api("POST", "/rescore", { ...readJson(rest[0]), ...option });
  }
  io.print(USAGE);
  return 2;
}

/** NEWS_RADAR_API_KEY from the environment, or else from `.env.local`. */
export function apiKey(env: Record<string, string | undefined>, envFile: string | null): string | undefined {
  if (env.NEWS_RADAR_API_KEY) return env.NEWS_RADAR_API_KEY;
  const match = envFile?.match(/^NEWS_RADAR_API_KEY=(.*)$/m);
  const value = match?.[1].trim().replace(/^"(.*)"$/, "$1");
  return value || undefined;
}

async function main() {
  const ENV_FILE = ".env.local";
  const key = apiKey(process.env, existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : null);
  if (!key) {
    console.error("No NEWS_RADAR_API_KEY in the environment or .env.local.");
    process.exit(2);
  }
  process.exitCode = await runNewsRadarCommand(process.argv.slice(2), {
    baseUrl: process.env.NEWS_RADAR_API_URL || DEFAULT_API_URL,
    key,
    print: (line) => console.log(line),
    readFile: (path) => readFileSync(path, "utf8"),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
