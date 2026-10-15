/**
 * Runs every test with coverage. When the run fails only because coverage fell short, it
 * then lists the uncovered lines, so the gaps are in the same output as the failure. A failing
 * test is already described in full by vitest, so no list follows one.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { currentReport } from "./coverage-report.mjs";

const RESULTS_FILE = path.resolve("tmp", "test-results.json");

/** Extra arguments select tests, and a partial run cannot reach the thresholds. */
const args = process.argv.slice(2);

fs.rmSync(RESULTS_FILE, { force: true });
const { status } = spawnSync("npx", ["vitest", "run", "--coverage", ...args], {
  stdio: "inherit",
});

if (status !== 0 && args.length === 0 && fs.existsSync(RESULTS_FILE)) {
  const results = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf8"));
  if (results.numFailedTests === 0 && results.numFailedTestSuites === 0) {
    console.log(`\n${currentReport()}`);
  }
}

process.exit(status ?? 1);
