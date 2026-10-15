import { dbTestsDisabled, dropStale, prepareTestDb } from "./pg";

/** Runs once per `vitest` invocation; see `prepareTestDb`. */
export default async function globalSetup() {
  if (dbTestsDisabled()) return;
  await prepareTestDb();
  return async () => {
    await dropStale();
  };
}
