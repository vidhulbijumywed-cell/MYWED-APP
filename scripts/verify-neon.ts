/** Run after neon deploy. Never seeds or imports customers. Uses synthetic data. */
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { Pool } from "pg";

// Next.js handles .env.local in the application; this CLI loads the same files.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
if (!process.env.DATABASE_URL)
  throw new Error("Missing DATABASE_URL. Run neon deploy first.");
const connection = new URL(process.env.DATABASE_URL);
if (!connection.hostname.endsWith(".neon.tech")) {
  throw new Error(
    "Verification requires a real Neon endpoint, not a local fallback.",
  );
}
const base = process.env.MYWED_VERIFY_URL || "http://127.0.0.1:3010";
const origin = new URL(base).origin;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 15000,
});
const id = randomUUID();
const marker = `NEON-SMOKE-${id}`;
const input = {
  id,
  bride: marker,
  bridePhone: "9000000001",
  groom: "Fictional Verification Groom",
  groomPhone: "9000000002",
  email: "neon-smoke@example.test",
  preferredContact: "Bride",
  events: [
    {
      type: "Wedding",
      date: "",
      venue: "Fictional Verification Venue",
      services: ["Candid photography"],
    },
  ],
  album: "Soft copies only",
  budget: "Not specified",
  notes: "Synthetic verification; removed after the check.",
  consent: true,
  website: "",
};
try {
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200, "Database health check must succeed");
  assert.equal((await health.json()).status, "ok");
  console.log("PASS: running application health queried PostgreSQL");
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${base}/api/studio-enquiries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(input),
    });
    assert.equal(
      response.status,
      201,
      "Application enquiry submission must succeed",
    );
    assert.equal((await response.json()).id, id);
  }
  const result = await pool.query(
    "SELECT payload FROM studio_enquiries WHERE id=$1",
    [id],
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].payload.bride, marker);
  assert.deepEqual(result.rows[0].payload.events, input.events);
  console.log(
    "PASS: app enquiry endpoint wrote to Neon; direct read verified all event fields and retry deduplication",
  );
  const listing = await fetch(`${base}/api/studio-enquiries`);
  assert.equal(listing.status, 405);
  console.log("PASS: public endpoint does not list customer details");
} finally {
  try {
    await pool.query(
      "DELETE FROM studio_enquiries WHERE id=$1 AND payload->>'bride'=$2",
      [id, marker],
    );
  } finally {
    await pool.end();
  }
}
