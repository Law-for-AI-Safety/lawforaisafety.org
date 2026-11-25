import type { Config } from "drizzle-kit";
import { existsSync } from "node:fs";

// Read .env.local like Next.js does, so `npm run db:migrate` finds the local
// DATABASE_URL without exporting it first. Existing env vars win.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// `out` is Netlify Database's migrations directory, not a Drizzle default:
// Netlify applies every SQL file in it, in order of the number its name starts
// with, just before a production deploy or deploy preview is published, and
// blocks the deploy if one fails. So for production the workflow is
// `npm run db:generate`, commit, deploy — never `migrate` or `push` against
// the Netlify database.
//
// Locally, `npm run dev` still runs `drizzle-kit migrate` against the Docker
// Postgres from this same directory (scripts/db-ensure.mjs).
//
// New migrations are named by their UTC creation time
// (`20261125143000_name.sql`), so branches written in parallel never pick the
// same name. The early ones keep their sequential names (0000, 0001, ...),
// since Netlify blocks a deploy if an applied migration disappears. Netlify
// refuses a new migration whose number is at or below the highest applied, and
// a timestamp is always above the sequential numbers. test/migrations.test.ts
// checks the ordering holds.
//
// `generate` only diffs schema.ts against the migration history and never
// connects, so a placeholder is fine there. `migrate` needs a real
// DATABASE_URL (from .env.local or the environment).
export default {
  schema: "./src/drizzle/schema.ts",
  out: "./netlify/database/migrations",
  dialect: "postgresql",
  migrations: { prefix: "timestamp" },
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      process.env.NETLIFY_DB_URL ??
      "postgres://placeholder/placeholder",
  },
} satisfies Config;
