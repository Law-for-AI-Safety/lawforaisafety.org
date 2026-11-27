import { afterAll, inject } from "vitest";
import { cloneName, createTestDb, testDbUrl } from "./pg";

/**
 * Gives a `*.db.test.*` file its own copy of the database (see `test/pg.ts`). vitest isolates
 * module state per file, so `src/lib/db.ts` builds its shared pool afresh in each, from the
 * `DATABASE_URL` set here, which runs before any test module is imported. The clone is dropped
 * with the rest of the run's databases when the run ends (`test/global-setup-db.ts`).
 */
const setupError = inject("dbSetupError");
if (setupError) throw new Error(setupError);

const name = cloneName(inject("dbRunId"));
await createTestDb(inject("dbRunId"), name);
process.env.DATABASE_URL = testDbUrl(name);

afterAll(async () => {
  // The clone is left for the run's teardown (`dropRun`), which drops every clone at once.
  // Postgres makes each DROP DATABASE wait for a checkpoint, and a checkpoint flushes every
  // other file's writes, so a drop here would wait behind the whole run's I/O.
  await globalThis.__dbPool?.end();
  globalThis.__dbPool = undefined;
});
