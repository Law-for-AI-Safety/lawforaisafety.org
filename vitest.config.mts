import { defineConfig } from "vitest/config";
import type { TestProjectInlineConfiguration } from "vitest/config";
import { availableParallelism } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

/**
 * Tests, run with `npm test` (or `npm run test:coverage`, which `check-all` and CI use). Four
 * projects share one config: `.test.ts` files run in plain node and `.test.tsx` files in
 * jsdom, and a file named `*.db.test.ts(x)` goes to the matching database project, where it
 * gets a private Postgres database cloned from a migrated template (see `test/pg.ts`). Without
 * Postgres only the database files fail; `npm run test:no-db` leaves them out.
 *
 * The harness lives in `test/`; each file there explains its part.
 */

/**
 * The test server is `TEST_DATABASE_URL`. Without it, the server named by `DATABASE_URL` in
 * .env.local is used, but only on this machine: the harness creates and force-drops databases
 * there, so it never follows that setting to a remote host. No other .env.local value is read,
 * since the rest are real credentials.
 */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
if (!process.env.TEST_DATABASE_URL && existsSync(".env.local")) {
  const local = parseEnv(readFileSync(".env.local", "utf8"));
  const url = local.TEST_DATABASE_URL || local.DATABASE_URL;
  if (url && LOOPBACK.has(new URL(url).hostname)) process.env.TEST_DATABASE_URL = url;
}
if (!process.env.VITEST_MAX_WORKERS && existsSync(".env.local")) {
  const local = parseEnv(readFileSync(".env.local", "utf8"));
  if (local.VITEST_MAX_WORKERS) process.env.VITEST_MAX_WORKERS = local.VITEST_MAX_WORKERS;
}

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };
const exclude = ["node_modules/**", ".next/**", "coverage/**", "tmp/**", "demo/**", ".claude/**"];
const DB_TESTS = "**/*.db.test.{ts,tsx}";

// Every worker holds a jsdom window or a database copy. A dev machine also runs the browser
// and Docker, so locally use half the cores; CI takes vitest's default. `VITEST_MAX_WORKERS`
// (settable in .env.local) overrides either.
const maxWorkers =
  Number(process.env.VITEST_MAX_WORKERS) ||
  (process.env.CI ? undefined : Math.max(1, Math.floor(availableParallelism() / 2)));

// Locally a passing run is one screen; CI keeps the full log and the per-file coverage table.
const quiet = !process.env.CI;
// Lets `npm run test:coverage` tell a failing test from a coverage shortfall.
const RESULTS_FILE = "tmp/test-results.json";

function project(
  name: string,
  { dom, db }: { dom: boolean; db: boolean },
): TestProjectInlineConfiguration {
  const files = dom ? "**/*.test.tsx" : "**/*.test.ts";
  return {
    resolve: { alias },
    test: {
      name,
      include: [db ? (dom ? "**/*.db.test.tsx" : "**/*.db.test.ts") : files],
      exclude: db ? exclude : [...exclude, DB_TESTS],
      environment: dom ? "jsdom" : "node",
      globalSetup: db ? ["./test/global-setup-db.ts"] : [],
      setupFiles: [
        "./test/setup-env.ts",
        ...(db ? ["./test/setup-db.ts"] : []),
        ...(dom ? ["./test/setup-dom.ts"] : []),
      ],
      // Form tests run a real route handler against Postgres; a busy CI runner is slow.
      ...(dom && db ? { testTimeout: 30_000 } : {}),
    },
  };
}

export default defineConfig({
  resolve: { alias },
  test: {
    maxWorkers,
    reporters: [
      quiet ? "minimal" : "default",
      ["json", { outputFile: RESULTS_FILE }],
      ...(process.env.GITHUB_ACTIONS === "true" ? ["github-actions"] : []),
    ],
    projects: [
      project("node", { dom: false, db: false }),
      project("dom", { dom: true, db: false }),
      project("node-db", { dom: false, db: true }),
      project("dom-db", { dom: true, db: true }),
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts"],
      reporter: [quiet ? "text-summary" : "text", "html", "lcov", "json", "json-summary"],
      // CI reads the summary even from a failed run, to show what was missed.
      reportOnFailure: true,
      reportsDirectory: "./coverage",
      thresholds: {
        // A floor for everything under src/: raise it as tests are added, never lower it.
        lines: 57.1,
        statements: 57.6,
        // The CMS is written test-first: every line and statement must run. It applies to
        // each file as soon as it exists under src/cms/.
        "src/cms/**": { lines: 100, statements: 100 },
      },
    },
  },
});
