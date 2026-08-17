// Ensures the local Postgres container is up and migrated before `next dev`
// starts — so `npm run dev` is the only command needed for local work on the
// signup & vetting feature. See README → "Signup & vetting feature — local dev".
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ENV_FILE = ".env.local";

function run(command, options = {}) {
  const result = execSync(command, { stdio: "pipe", ...options });
  return result ? result.toString() : "";
}

function loadEnvFile(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    env[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim();
  }
  return env;
}

if (!existsSync(ENV_FILE)) {
  console.error(
    `\n${ENV_FILE} not found. Run: cp .env.example ${ENV_FILE}, fill in the values, then try again.\n`,
  );
  process.exit(1);
}

try {
  run("docker info");
} catch {
  console.error(
    "\nDocker doesn't appear to be running. Start Docker Desktop, then try again.\n",
  );
  process.exit(1);
}

console.log("Starting local Postgres (npm run db:up)...");
run(`docker compose --env-file ${ENV_FILE} up -d db`, { stdio: "inherit" });

console.log("Waiting for Postgres to accept connections...");
const deadline = Date.now() + 30_000;
let ready = false;
while (Date.now() < deadline) {
  try {
    run(`docker compose --env-file ${ENV_FILE} exec -T db pg_isready -U postgres`);
    ready = true;
    break;
  } catch {
    execSync("sleep 1");
  }
}
if (!ready) {
  console.error("\nPostgres didn't become ready in time. Check `docker compose logs db`.\n");
  process.exit(1);
}

console.log("Running migrations...");
const envVars = loadEnvFile(ENV_FILE);
run("npx drizzle-kit migrate", {
  stdio: "inherit",
  env: { ...process.env, ...envVars },
});

console.log("Database ready.");
