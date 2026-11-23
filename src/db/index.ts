import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const rawDatabaseUrl = process.env.DATABASE_URL;

if (!rawDatabaseUrl) {
  throw new Error("DATABASE_URL is required");
}

// Neon connection strings include channel_binding=require which the
// node-postgres (pg) driver cannot use on Vercel/serverless — strip it.
// Keep sslmode=require so Neon still enforces SSL.
const databaseUrl = rawDatabaseUrl
  .replace(/&channel_binding=[^&]+/g, "")
  .replace(/\?channel_binding=[^&]+&/g, "?")
  .replace(/\?channel_binding=[^&]+/g, "");

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("neon.tech")
      ? { rejectUnauthorized: false }
      : undefined,
    max: 1,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
