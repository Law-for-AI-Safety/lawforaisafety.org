// `npm run news-radar -- <command>`: the News radar API from the command line, for an agent tuning
// the radar's topics (see news-radar-tuning.md). It signs requests with NEWS_RADAR_API_KEY, from
// the environment or `.env.local`, and never prints it. It talks to the live site unless
// NEWS_RADAR_API_URL names another.
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const DEFAULT_API_URL = "https://lawforaisafety.org";

export const USAGE = `Usage: npm run -s news-radar -- <command>

  export [--since DAY] [--until DAY]           Stored items with their triage state and matched keywords, as JSON
  settings get                                 The topics, trusted outlets and updatedAt, as JSON
  settings put <file.json>                     Replaces the topics and trusted outlets with the file's; refused if
                                               the settings were saved since the file's updatedAt
  rescore <file.json> [--since DAY] [--until DAY]
                                               How stored items would score under the file's settings; saves nothing

A DAY is YYYY-MM-DD. --since defaults to 90 days ago, --until (not included) to now. Talks to ${DEFAULT_API_URL} unless NEWS_RADAR_API_URL is set.`;

export type CommandIo = {
  baseUrl: string;
  key: string;
  print: (line: string) => void;
  readFile: (path: string) => string;
  /** How requests are sent; the global fetch unless a test stands in for a server. */
  fetch?: typeof fetch;
};

/** `--since DAY` and `--until DAY`, in any order, or null when the arguments are not that shape. */
function rangeOptions(args: string[]): { since?: string; until?: string } | null {
  const options: { since?: string; until?: string } = {};
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i] === "--since" ? "since" : args[i] === "--until" ? "until" : null;
    if (!name || args[i + 1] === undefined || options[name] !== undefined) return null;
    options[name] = args[i + 1];
  }
  return options;
}

/** Runs one command and returns the process's exit code: 0 for success, 1 for a refused request, 2 for bad usage. */
export async function runNewsRadarCommand(args: string[], io: CommandIo): Promise<number> {
  const api = async (method: string, path: string, body?: unknown) => {
    const response = await (io.fetch ?? fetch)(`${io.baseUrl}/api/admin/news-radar${path}`, {
      method,
      headers: { Authorization: `Bearer ${io.key}`, ...(body !== undefined && { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      io.print(`${method} ${path} failed with ${response.status}: the answer was not JSON. Is NEWS_RADAR_API_URL right?`);
      return 1;
    }
    if (!response.ok) {
      const error = (data as { error?: unknown }).error;
      io.print(`${method} ${path} failed with ${response.status}: ${typeof error === "string" ? error : JSON.stringify(data)}`);
      return 1;
    }
    io.print(JSON.stringify(data, null, 2));
    return 0;
  };
  /** The settings file as an object, or null after saying what is wrong with it. */
  const readSettings = (path: string): Record<string, unknown> | null => {
    let data: unknown;
    try {
      data = JSON.parse(io.readFile(path));
    } catch (err) {
      io.print(`Could not read ${path} as JSON: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
    if (typeof data === "object" && data !== null && !Array.isArray(data)) return data as Record<string, unknown>;
    io.print(`${path} must hold a JSON object with "topics" and "trustedOutlets", as settings get prints.`);
    return null;
  };

  const [command, ...rest] = args;
  if (command === "export") {
    const range = rangeOptions(rest);
    if (range) return api("GET", `/items${range.since || range.until ? `?${new URLSearchParams(range)}` : ""}`);
  }
  if (command === "settings" && rest.length === 1 && rest[0] === "get") return api("GET", "/settings");
  if (command === "settings" && rest.length === 2 && rest[0] === "put") {
    const settings = readSettings(rest[1]);
    return settings ? api("PUT", "/settings", settings) : 1;
  }
  if (command === "rescore" && rest.length >= 1) {
    const range = rangeOptions(rest.slice(1));
    if (range) {
      const settings = readSettings(rest[0]);
      return settings ? api("POST", "/rescore", { ...settings, since: range.since, until: range.until }) : 1;
    }
  }
  io.print(USAGE);
  return 2;
}

/** NEWS_RADAR_API_KEY from the environment, or else from `.env.local`. */
export function apiKey(env: Record<string, string | undefined>, envFile: string | null): string | undefined {
  if (env.NEWS_RADAR_API_KEY) return env.NEWS_RADAR_API_KEY;
  const match = envFile?.match(/^NEWS_RADAR_API_KEY=(.*)$/m);
  if (!match) return undefined;
  const raw = match[1].trim();
  const quoted = raw.match(/^(["'])(.*)\1/);
  const value = quoted ? quoted[2] : raw.replace(/\s+#.*$/, "");
  return value || undefined;
}

async function main() {
  const ENV_FILE = ".env.local";
  const key = apiKey(process.env, existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : null);
  if (!key) {
    console.error("No NEWS_RADAR_API_KEY in the environment or .env.local.");
    process.exit(2);
  }
  try {
    process.exitCode = await runNewsRadarCommand(process.argv.slice(2), {
      baseUrl: process.env.NEWS_RADAR_API_URL || DEFAULT_API_URL,
      key,
      print: (line) => console.log(line),
      readFile: (path) => readFileSync(path, "utf8"),
    });
  } catch (err) {
    // A request that never got an answer: the server is down or NEWS_RADAR_API_URL is wrong.
    console.error(`The request failed: ${err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : String(err)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
