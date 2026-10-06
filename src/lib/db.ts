import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
type Result = { rows: Record<string, any>[] };
export type Query = (sql: string, params?: any[]) => Promise<Result>;
type Database = {
  query: Query;
  transaction: <T>(fn: (q: Query) => Promise<T>) => Promise<T>;
};
const globalDb = globalThis as unknown as { mywedDb?: Promise<Database> };
async function create(): Promise<Database> {
  const migration = readFileSync(
    path.join(process.cwd(), "migrations/001_initial.sql"),
    "utf8",
  );
  if (process.env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
    });
    await pool.query(migration);
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
  const dir =
    process.env.MYWED_DATA_DIR || path.join(process.cwd(), ".data/postgres");
  mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  await pg.waitReady;
  await pg.exec(migration);
  return {
    query: async (s, p) => pg.query(s, p),
    transaction: async (fn) =>
      pg.transaction(async (t) => fn(async (s, p) => t.query(s, p))),
  };
}
export async function db() {
  return (globalDb.mywedDb ??= create());
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
