import type { Config } from "drizzle-kit";

// `out` is Netlify Database's migrations directory, not a Drizzle default:
// Netlify applies every SQL file in it, in filename order, just before a
// production deploy or deploy preview is published, and blocks the deploy if
// one fails. So for production the workflow is `npm run db:generate`, commit,
// deploy — never `migrate` or `push` against the Netlify database.
//
// Locally, `npm run dev` still runs `drizzle-kit migrate` against the Docker
// Postgres from this same directory (scripts/db-ensure.mjs).
//
// `generate` only diffs schema.ts against the migration history and never
// connects, so a placeholder is fine there. `migrate` needs a real
// DATABASE_URL in the environment.
export default {
  schema: "./src/drizzle/schema.ts",
  out: "./netlify/database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      process.env.NETLIFY_DB_URL ??
      "postgres://placeholder/placeholder",
  },
} satisfies Config;
