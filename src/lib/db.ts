import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "@neon/env";
import neonConfig from "../../neon";
type Result = { rows: Record<string, any>[] };
export type Query = (sql: string, params?: any[]) => Promise<Result>;
type Database = {
  query: Query;
  transaction: <T>(fn: (q: Query) => Promise<T>) => Promise<T>;
};
const globalDb = globalThis as unknown as { mywedDb?: Promise<Database> };
function validateConnection(name: string, value: string) {
  try {
    const url = new URL(value);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !url.username ||
      !url.pathname.slice(1)
    ) {
      throw new Error("invalid");
    }
  } catch {
    throw Object.assign(
      new Error(`${name} must contain only a PostgreSQL connection URL.`),
      {
        code:
          name === "DATABASE_URL" ? "DB_URL_INVALID" : "DB_DIRECT_URL_INVALID",
      },
    );
  }
}
async function create(): Promise<Database> {
  const migrationDir = path.join(process.cwd(), "migrations");
  const migrations = readdirSync(migrationDir)
    .filter((file) => /^\d+_[\w-]+\.sql$/.test(file))
    .sort()
    .map((file) => readFileSync(path.join(migrationDir, file), "utf8"));
  if (process.env.DATABASE_URL) {
    validateConnection("DATABASE_URL", process.env.DATABASE_URL);
    if (process.env.DATABASE_URL_UNPOOLED)
      validateConnection(
        "DATABASE_URL_UNPOOLED",
        process.env.DATABASE_URL_UNPOOLED,
      );
    const { postgres } = parseEnv(neonConfig, ["DATABASE_URL"]);
    const pool = new Pool({
      connectionString: postgres.databaseUrl,
      max: 5,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
    });
    // Neon provides a direct URL for schema work and a pooled URL for queries.
    const migrationPool = process.env.DATABASE_URL_UNPOOLED
      ? new Pool({
          connectionString: process.env.DATABASE_URL_UNPOOLED,
          max: 1,
          connectionTimeoutMillis: 15000,
        })
      : pool;
    try {
      for (const migration of migrations) await migrationPool.query(migration);
    } catch (error) {
      await pool.end();
      throw error;
    } finally {
      if (migrationPool !== pool) await migrationPool.end();
    }
    return {
      query: async (s, p) => pool.query(s, p),
      transaction: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const r = await fn(async (s, p) => c.query(s, p));
          await c.query("COMMIT");
          return r;
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      },
    };
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is required in production; local database fallback is disabled.",
    );
  }
  const dir =
    process.env.MYWED_DATA_DIR || path.join(process.cwd(), ".data/postgres");
  mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  await pg.waitReady;
  for (const migration of migrations) await pg.exec(migration);
  return {
    query: async (s, p) => pg.query(s, p),
    transaction: async (fn) =>
      pg.transaction(async (t) => fn(async (s, p) => t.query(s, p))),
  };
}
export async function db() {
  const pending = (globalDb.mywedDb ??= create());
  try {
    return await pending;
  } catch (error) {
    // A failed first connection must not poison all future Render health probes.
    if (globalDb.mywedDb === pending) globalDb.mywedDb = undefined;
    throw error;
  }
}
export const query: Query = async (s, p) => (await db()).query(s, p);
export async function transaction<T>(fn: (q: Query) => Promise<T>) {
  return (await db()).transaction(fn);
}
export function dateOnly(v: any): string {
  if (!v) return "";
  return v instanceof Date
    ? v.toISOString().slice(0, 10)
    : String(v).slice(0, 10);
}
export function normalize(row: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      v instanceof Date
        ? v.toISOString().slice(0, k.endsWith("_at") ? 24 : 10)
        : typeof v === "bigint"
          ? Number(v)
          : v,
    ]),
  );
}
