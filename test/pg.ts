import path from "node:path";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

/**
 * Every test file gets its own private database. Global setup migrates one template database
 * with the same Drizzle migrations Netlify applies, and each file clones it with
 * `CREATE DATABASE ... TEMPLATE`, which copies files instead of replaying SQL. That needs the
 * CREATEDB privilege, which the docker-compose and CI Postgres users have.
 *
 * The server is `TEST_DATABASE_URL`, or `DATABASE_URL` when that is unset. Only databases
 * named with `DB_PREFIX` are ever created or dropped there.
 */
export const DB_PREFIX = "vitest_";

const TEMPLATE_DB = `${DB_PREFIX}template`;
// vitest runs from the repo root (vitest.config.mts).
const MIGRATIONS_DIR = path.resolve("netlify/database/migrations");

/** Postgres refuses a clone while anything, even autovacuum, is connected to the template. */
const OBJECT_IN_USE = "55006";
const CLONE_ATTEMPTS = 20;

/** Set by `npm run test:no-db`, which leaves the `*.db.test.ts(x)` files out of the run. */
export function dbTestsDisabled(): boolean {
  return process.env.TEST_NO_DB === "1";
}

function serverUrl(): string {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "The database-backed tests need Postgres: set TEST_DATABASE_URL or DATABASE_URL " +
        "(see .env.example), or run `npm run test:no-db` to leave them out.",
    );
  }
  return url;
}

function urlForDatabase(database: string): string {
  const url = new URL(serverUrl());
  url.pathname = `/${database}`;
  return url.toString();
}

/** The URL `src/lib/db.ts` is given for the copy called `name`. */
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
        `(${reason}). Start it with \`npm run db:up\`, point ` +
        "TEST_DATABASE_URL at another server, or run `npm run test:no-db` to leave " +
        "out the database-backed tests (*.db.test.ts and *.db.test.tsx).",
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

/** Drops the template and every copy an interrupted run left behind. */
export async function dropStale(): Promise<void> {
  await withClient(async (client) => {
    const { rows } = await client.query<{ datname: string }>(
      "SELECT datname FROM pg_database WHERE datname LIKE $1",
      [`${DB_PREFIX.replace("_", "\\_")}%`],
    );
    for (const { datname } of rows) {
      await client.query(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
    }
  });
}

/**
 * Once per run: clears what an interrupted run left, then builds the template. A broken
 * migration or an unreachable server fails here with one clear error instead of once per file.
 */
export async function prepareTestDb(): Promise<void> {
  await dropStale();
  await withClient((client) => client.query(`CREATE DATABASE "${TEMPLATE_DB}"`));
  const client = await connect(urlForDatabase(TEMPLATE_DB));
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await client.end();
  }
}

export async function createTestDb(name: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await withClient((client) =>
        client.query(`CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE_DB}"`),
      );
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
  // FORCE disconnects a query the test file left in flight, which would otherwise block the drop.
  await withClient((client) => client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
}
