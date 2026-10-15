import { afterAll } from "vitest";
import { createTestDb, dbTestsDisabled, dropTestDb, testDbUrl, DB_PREFIX } from "./pg";

/**
 * Gives the current test file its own copy of the database (see `test/pg.ts`). vitest
 * isolates module state per file, so `src/lib/db.ts` builds its shared pool afresh in each,
 * from the `DATABASE_URL` set here, which runs before any test module is imported.
 *
 * With `TEST_NO_DB=1` the database-backed files are not collected, and `DATABASE_URL` names
 * a host that cannot resolve, so any other test that reaches the database fails visibly.
 */
const DROP_TIMEOUT_MS = 60_000;

delete process.env.NETLIFY_DB_URL;

if (dbTestsDisabled()) {
  process.env.DATABASE_URL = "postgres://test-no-db.invalid:5432/database-disabled-by-TEST_NO_DB";
} else {
  const name = `${DB_PREFIX}${process.pid}_${Math.random().toString(36).slice(2)}`;
  await createTestDb(name);
  process.env.DATABASE_URL = testDbUrl(name);

  afterAll(async () => {
    // Closes the app's pool so the drop is not fighting its connections.
    await globalThis.__dbPool?.end();
    globalThis.__dbPool = undefined;
    await dropTestDb(name);
  }, DROP_TIMEOUT_MS);
}
