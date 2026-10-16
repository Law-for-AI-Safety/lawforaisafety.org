import type { TestProject } from "vitest/node";
import { dropRun, newRunId, prepareTestDb } from "./pg";

declare module "vitest" {
  export interface ProvidedContext {
    /** Names this run's databases; see test/pg.ts. */
    dbRunId: string;
    /** Why the template could not be built, reported by every database test file. */
    dbSetupError: string | null;
  }
}

/**
 * Runs once per database project. A failure is handed to the test files rather than thrown,
 * so the unit projects still run and only the database files fail, each with the reason.
 */
export default async function globalSetup(project: TestProject) {
  const runId = newRunId();
  project.provide("dbRunId", runId);
  try {
    await prepareTestDb(runId);
    project.provide("dbSetupError", null);
  } catch (err) {
    project.provide("dbSetupError", (err as Error).message);
  }
  return async () => {
    // A template half-built before a failure is dropped too; with no server, there is nothing to drop.
    await dropRun(runId).catch(() => {});
  };
}
