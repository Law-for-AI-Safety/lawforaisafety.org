import { afterAll, inject } from "vitest";
import { cloneName, createTestDb, dropTestDb, testDbUrl } from "./pg";

/**
 * Gives a `*.db.test.*` file its own copy of the database (see `test/pg.ts`). vitest isolates
 * module state per file, so `src/lib/db.ts` builds its shared pool afresh in each, from the
 * `DATABASE_URL` set here, which runs before any test module is imported.
 */
const DROP_TIMEOUT_MS = 60_000;

const setupError = inject("dbSetupError");
if (setupError) throw new Error(setupError);

const name = cloneName(inject("dbRunId"));
await createTestDb(inject("dbRunId"), name);
process.env.DATABASE_URL = testDbUrl(name);

afterAll(async () => {
  // Closes the app's pool so the drop is not fighting its connections.
  await globalThis.__dbPool?.end();
  globalThis.__dbPool = undefined;
  await dropTestDb(name);
}, DROP_TIMEOUT_MS);
