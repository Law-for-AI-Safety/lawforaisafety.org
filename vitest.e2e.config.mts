import { defineConfig } from "vitest/config";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

/**
 * The end-to-end tests (`npm run e2e`, after `npm run build`): a real browser (Playwright's
 * Chromium) against the built app (`next start`), a real Postgres database, and the fake GitHub
 * served over HTTP. See e2e/cms.e2e.ts. They need the same test Postgres as the database tests
 * (`TEST_DATABASE_URL`, or a loopback `DATABASE_URL` in .env.local).
 */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
if (!process.env.TEST_DATABASE_URL && existsSync(".env.local")) {
  const local = parseEnv(readFileSync(".env.local", "utf8"));
  const url = local.TEST_DATABASE_URL || local.DATABASE_URL;
  if (url && LOOPBACK.has(new URL(url).hostname)) process.env.TEST_DATABASE_URL = url;
}

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["e2e/**/*.e2e.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
