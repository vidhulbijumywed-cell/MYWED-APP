import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { query } from "../src/lib/db";
import { databaseDiagnostic } from "../src/lib/database-diagnostic";

test("database initialisation recovers after a rejected first attempt", async () => {
  delete process.env.DATABASE_URL_UNPOOLED;
  process.env.MYWED_DATA_DIR = mkdtempSync(path.join(tmpdir(), "mywed-retry-"));
  process.env.DATABASE_URL = "DATABASE_URL=not-a-connection-url";
  await assert.rejects(
    query("SELECT 1"),
    (error: any) => error.code === "DB_URL_INVALID",
  );
  delete process.env.DATABASE_URL;
  assert.equal((await query("SELECT 1 AS connected")).rows[0].connected, 1);
});
test("health diagnostics never include raw credential-bearing error messages", () => {
  const secretMessage = "postgresql://user:private-password@example.test/db";
  const unknown = databaseDiagnostic({
    code: "UNKNOWN",
    message: secretMessage,
  });
  const known = databaseDiagnostic({ code: "28P01", message: secretMessage });
  assert.equal(unknown.includes("private-password"), false);
  assert.equal(known.includes("private-password"), false);
  assert.match(known, /password rejected/);
});
