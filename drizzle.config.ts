import type { Config } from "drizzle-kit";

// `generate` only diffs schema.ts against the migration history and never
// connects, so a placeholder is fine there. `migrate`/`push` need a real
// DATABASE_URL in the environment.
export default {
  schema: "./src/drizzle/schema.ts",
  out: "./src/drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      process.env.NETLIFY_DB_URL ??
      "postgres://placeholder/placeholder",
  },
} satisfies Config;
