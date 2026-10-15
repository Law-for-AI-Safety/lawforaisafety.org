import { defineConfig } from "vitest/config";
import { availableParallelism } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

/**
 * Unit and integration tests, run with `npm test` (or `npm run test:coverage`, which
 * `check-all` and CI use). Two projects share one config: `.test.ts` files run in plain
 * node, `.test.tsx` files get a jsdom window. A file named `*.db.test.ts(x)` uses the real
 * Postgres database: every test file gets a private copy cloned from a migrated template
 * (see `test/pg.ts`). `TEST_NO_DB=1` (`npm run test:no-db`) leaves those files out, for
 * machines without Postgres; CI always runs them.
 *
 * The harness lives in `test/`; each file there explains its part.
 */

// Only the database settings are read from .env.local. Its other values are real
// credentials, and a test must never pick one up by accident.
const LOCAL_ENV_KEYS = ["TEST_DATABASE_URL", "DATABASE_URL", "VITEST_MAX_WORKERS"];
if (existsSync(".env.local")) {
  const local = parseEnv(readFileSync(".env.local", "utf8"));
  for (const key of LOCAL_ENV_KEYS) {
    if (process.env[key] === undefined && local[key]) process.env[key] = local[key];
  }
}

const noDb = process.env.TEST_NO_DB === "1";
const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };
const exclude = [
  "node_modules/**",
  ".next/**",
  "coverage/**",
  "tmp/**",
  "demo/**",
  ".claude/**",
  ...(noDb ? ["**/*.db.test.{ts,tsx}"] : []),
];

// Every worker holds its own database copy, and a jsdom window in the dom project. A dev
// machine also runs the browser and Docker, so locally use half the cores; CI takes vitest's
// default. `VITEST_MAX_WORKERS` (settable in .env.local) overrides either.
const maxWorkers =
  Number(process.env.VITEST_MAX_WORKERS) ||
  (process.env.CI ? undefined : Math.max(1, Math.floor(availableParallelism() / 2)));

// Locally a passing run is one screen; CI keeps the full log and the per-file coverage table.
const quiet = !process.env.CI;
// Lets `npm run test:coverage` tell a failing test from a coverage shortfall.
const RESULTS_FILE = "tmp/test-results.json";

export default defineConfig({
  resolve: { alias },
  test: {
    maxWorkers,
    reporters: [
      quiet ? "minimal" : "default",
      ["json", { outputFile: RESULTS_FILE }],
      ...(process.env.GITHUB_ACTIONS === "true" ? ["github-actions"] : []),
    ],
    globalSetup: ["./test/global-setup.ts"],
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          include: ["**/*.test.ts"],
          exclude,
          environment: "node",
          setupFiles: ["./test/setup-env.ts", "./test/setup-db.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "dom",
          include: ["**/*.test.tsx"],
          exclude,
          environment: "jsdom",
          setupFiles: ["./test/setup-env.ts", "./test/setup-db.ts", "./test/setup-dom.ts"],
          // Form tests run a real route handler against Postgres; a busy CI runner is slow.
          testTimeout: 30_000,
        },
      },
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
        lines: 2.7,
        statements: 2.6,
        // The CMS is written test-first: every line and statement must run.
        "src/cms/**": { lines: 100, statements: 100 },
      },
    },
  },
});
