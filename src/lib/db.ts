import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/drizzle/schema";

declare global {
  var __dbPool: Pool | undefined;
}

const pool =
  globalThis.__dbPool ??
  new Pool({ connectionString: requireEnv("DATABASE_URL") });

if (process.env.NODE_ENV !== "production") {
  globalThis.__dbPool = pool;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const db = drizzle(pool, { schema });
