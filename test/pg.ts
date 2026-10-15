import path from "node:path";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

/**
 * Every `*.db.test.*` file gets its own private database. Global setup migrates a template
 * database with the same Drizzle migrations Netlify applies, and each file clones it with
 * `CREATE DATABASE ... TEMPLATE`, which copies files instead of replaying SQL. That needs the
 * CREATEDB privilege, which the docker-compose and CI Postgres users have.
 *
 * The server is `TEST_DATABASE_URL` (vitest.config.mts derives a loopback-only default from
 * .env.local). Every database a run creates is named `vitest_<run>_...`, so runs sharing a
 * server, such as parallel worktrees, never touch each other's databases.
 */
const DB_PREFIX = "vitest_";

/** Databases a crashed run left behind are dropped once they are this old. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
// vitest runs from the repo root (vitest.config.mts).
const MIGRATIONS_DIR = path.resolve("netlify/database/migrations");

/** Postgres refuses a clone while anything, even autovacuum, is connected to the template. */
const OBJECT_IN_USE = "55006";
const CLONE_ATTEMPTS = 20;

/**
 * Read once, when the harness loads: `test/setup-db.ts` then points the app's `DATABASE_URL`
 * at the file's clone, and nothing here may follow it there.
 */
const SERVER_URL = process.env.TEST_DATABASE_URL;

function serverUrl(): string {
  if (!SERVER_URL) {
    throw new Error(
      "The database tests need Postgres: run `npm run db:up` (with DATABASE_URL in " +
        ".env.local pointing at localhost), or set TEST_DATABASE_URL. " +
        "`npm run test:no-db` runs only the tests that need no database.",
    );
  }
  return SERVER_URL;
}

function urlForDatabase(database: string): string {
  const url = new URL(serverUrl());
  url.pathname = `/${database}`;
  return url.toString();
}

/** A token naming one run's databases. */
export function newRunId(): string {
  return `${process.pid}${Math.random().toString(36).slice(2, 8)}`;
}

function runPrefix(runId: string): string {
  return `${DB_PREFIX}${runId}_`;
}

function templateName(runId: string): string {
  return `${runPrefix(runId)}template`;
}

/** The name of a fresh clone for one test file of run `runId`. */
export function cloneName(runId: string): string {
  return `${runPrefix(runId)}${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
}

/** The URL `src/lib/db.ts` is given for the database called `name`. */
export function testDbUrl(name: string): string {
  return urlForDatabase(name);
}

async function connect(connectionString: string): Promise<Client> {
  const client = new Client({ connectionString });
  try {
    await client.connect();
  } catch (err) {
    // The password stays out of the message.
    const { hostname, port, username } = new URL(connectionString);
    // A refused connection is an AggregateError with an empty message.
    const reason = (err as Error).message || (err as { code?: string }).code;
    throw new Error(
      `Cannot reach the test Postgres at ${username}@${hostname}:${port || 5432} ` +
        `(${reason}). Start it with \`npm run db:up\` or point TEST_DATABASE_URL at ` +
        "another server. `npm run test:no-db` runs only the tests that need no database.",
      { cause: err },
    );
  }
  return client;
}

/** Runs against the server's own database, from which test databases are created and dropped. */
async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await connect(serverUrl());
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Records when a database was created, so a crashed run's leftovers can be recognised. */
async function stampCreated(client: Client, database: string): Promise<void> {
  await client.query(`COMMENT ON DATABASE "${database}" IS 'vitest ${Date.now()}'`);
}

async function dropDatabases(client: Client, names: string[]): Promise<void> {
  // FORCE disconnects a query a test file left in flight, which would otherwise block the drop.
  for (const name of names) await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
}

/**
 * Drops test databases whose creation stamp is older than any run lasts: what a run that
 * crashed before its teardown left behind. A live run's databases are always newer.
 */
async function dropAbandoned(client: Client): Promise<void> {
  const { rows } = await client.query<{ datname: string; note: string | null }>(
    `SELECT datname, shobj_description(oid, 'pg_database') AS note
       FROM pg_database WHERE datname LIKE $1`,
    [`${DB_PREFIX.replace("_", "\\_")}%`],
  );
  const cutoff = Date.now() - STALE_AFTER_MS;
  const abandoned = rows
    .filter(({ note }) => {
      const created = Number(note?.match(/^vitest (\d+)$/)?.[1]);
      return Number.isFinite(created) && created > 0 && created < cutoff;
    })
    .map(({ datname }) => datname);
  await dropDatabases(client, abandoned);
}

/**
 * Once per run: builds run `runId`'s template. A broken migration or an unreachable server
 * fails here with one error, which `test/setup-db.ts` reports in every database test file.
 */
export async function prepareTestDb(runId: string): Promise<void> {
  const template = templateName(runId);
  await withClient(async (client) => {
    await dropAbandoned(client);
    await client.query(`CREATE DATABASE "${template}"`);
    await stampCreated(client, template);
  });
  const client = await connect(urlForDatabase(template));
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await client.end();
  }
}

/** Drops run `runId`'s template and any clone of it a test file failed to drop. */
export async function dropRun(runId: string): Promise<void> {
  await withClient(async (client) => {
    const { rows } = await client.query<{ datname: string }>(
      "SELECT datname FROM pg_database WHERE starts_with(datname, $1)",
      [runPrefix(runId)],
    );
    await dropDatabases(
      client,
      rows.map((row) => row.datname),
    );
  });
}

export async function createTestDb(runId: string, name: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await withClient(async (client) => {
        await client.query(`CREATE DATABASE "${name}" TEMPLATE "${templateName(runId)}"`);
        await stampCreated(client, name);
      });
      return;
    } catch (err) {
      if ((err as { code?: string }).code !== OBJECT_IN_USE || attempt === CLONE_ATTEMPTS) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
    }
  }
}

export async function dropTestDb(name: string): Promise<void> {
  await withClient((client) => dropDatabases(client, [name]));
}
