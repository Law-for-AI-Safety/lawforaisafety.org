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
//
// Cached on globalThis in every env, including production: each warm
// serverless function instance reuses one Pool/connection across
// invocations instead of opening a fresh one every time, which otherwise
// kept the Neon compute from ever autosuspending.
const pool =
  globalThis.__dbPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL,
  });

globalThis.__dbPool = pool;

export const db = drizzle(pool, { schema });
