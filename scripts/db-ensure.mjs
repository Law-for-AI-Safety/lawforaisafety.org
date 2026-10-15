// Ensures the local database is up and migrated before `next dev` starts — so
// `npm run dev` is the only command needed for local work on the signup &
// vetting feature. See README → "Signup & vetting feature — local dev".
//
// Uses whatever Postgres DATABASE_URL (from .env.local) points at. If nothing
// answers there and it's a local address, starts this repo's Docker Compose
// `db` container first. So a database run some other way (your own Postgres,
// or a container started by tooling outside this repo) is used as is, and
// Docker is only needed when this script has to start one.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import pg from "pg";

const ENV_FILE = ".env.local";

if (!existsSync(ENV_FILE)) {
  console.error(
    `\n${ENV_FILE} not found. Run: cp .env.example ${ENV_FILE}, fill in the values, then try again.\n`,
  );
  process.exit(1);
}
process.loadEnvFile(ENV_FILE);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`\nDATABASE_URL isn't set in ${ENV_FILE}. See .env.example.\n`);
  process.exit(1);
}
const { hostname } = new URL(url);

async function canConnect() {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

if (!(await canConnect())) {
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    console.error(`\nCan't connect to the database at ${hostname} (DATABASE_URL in ${ENV_FILE}).\n`);
    process.exit(1);
  }

  try {
    execSync("docker info", { stdio: "ignore" });
  } catch {
    console.error(
      "\nNo database is running at DATABASE_URL, and Docker doesn't appear to be running to start one. Start Docker Desktop, then try again.\n",
    );
    process.exit(1);
  }

  console.log("Starting local Postgres (npm run db:up)...");
  execSync(`docker compose --env-file ${ENV_FILE} up -d db`, { stdio: "inherit" });

  console.log("Waiting for Postgres to accept connections...");
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (!ready && Date.now() < deadline) {
    ready = await canConnect();
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) {
    console.error("\nPostgres didn't become ready in time. Check `docker compose logs db`.\n");
    process.exit(1);
  }
}

console.log("Running migrations...");
execSync("npx drizzle-kit migrate", { stdio: "inherit" });

console.log("Database ready.");
