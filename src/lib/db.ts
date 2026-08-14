import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/drizzle/schema";

declare global {
  var __dbPool: Pool | undefined;
}

// Connection string is read lazily (not thrown on at module scope) — Next.js
// imports this module to collect route page-data at build time, before any
// deploy-time env vars (e.g. Netlify Database's NETLIFY_DB_URL) are set. An
// eager throw here would fail the build for routes that never even run.
const pool =
  globalThis.__dbPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__dbPool = pool;
}

export const db = drizzle(pool, { schema });
