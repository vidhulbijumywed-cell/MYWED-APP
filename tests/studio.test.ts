import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { query } from "../src/lib/db";
import {
  enquirySchema,
  storeEnquiry,
  allowEnquiry,
} from "../src/lib/studio-enquiries";
import { POST } from "../src/app/api/studio-enquiries/route";

delete process.env.DATABASE_URL;
delete process.env.DATABASE_URL_UNPOOLED;
process.env.MYWED_DATA_DIR = mkdtempSync(
  path.join(tmpdir(), "mywed-enquiry-test-"),
);
function payload() {
  return {
    id: randomUUID(),
    bride: "Fictional Bride",
    bridePhone: "9000000001",
    groom: "Fictional Groom",
    groomPhone: "+91 9000000002",
    email: "test@example.test",
    preferredContact: "Bride",
    events: [
      {
        type: "Wedding",
        date: "2027-01-17",
        venue: "Fictional Hall",
        services: ["Drone", "Candid photography"],
      },
    ],
    album: "Soft copies only",
    budget: "Not specified",
    notes: "",
    consent: true,
    website: "",
  };
}
test("enquiry consent, dates, services and phone validation; idempotent storage with no overwrite", async () => {
  const input = payload();
  for (const changes of [
    { consent: false },
    { bride: "  " },
    { bridePhone: "abc" },
    { website: "bot" },
  ]) {
    assert.equal(
      enquirySchema.safeParse({ ...input, ...changes }).success,
      false,
    );
  }
  assert.equal(
    enquirySchema.safeParse({
      ...input,
      events: [{ ...input.events[0], date: "2027-02-31" }],
    }).success,
    false,
  );
  assert.equal(
    enquirySchema.safeParse({
      ...input,
      events: [{ ...input.events[0], services: [] }],
    }).success,
    false,
  );
  assert.equal(
    enquirySchema.safeParse({
      ...input,
      events: [{ ...input.events[0], date: "" }],
    }).success,
    true,
  );
  assert.deepEqual(await storeEnquiry(input), { id: input.id });
  assert.deepEqual(await storeEnquiry(input), { id: input.id });
  assert.deepEqual(await storeEnquiry({ ...input, bride: "Changed" }), {
    conflict: true,
  });
  const result = await query("SELECT * FROM studio_enquiries WHERE id=$1", [
    input.id,
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].payload.bride, "Fictional Bride");
  assert.equal(result.rows[0].status, "new");
  assert.equal("website" in result.rows[0].payload, false);
});
test("public intake rejects foreign origins and oversize bodies, returns no contacts, and shares rate limits", async () => {
  const input = payload();
  const request = (body: string, origin = "http://localhost:3000") =>
    new Request("http://localhost:3000/api/studio-enquiries", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.10",
      },
      body,
    });
  assert.equal(
    (await POST(request(JSON.stringify(input), "https://foreign.example")))
      .status,
    403,
  );
  assert.equal((await POST(request("x".repeat(24001)))).status, 413);
  assert.equal((await POST(request("{"))).status, 400);
  assert.equal(
    (await POST(request(JSON.stringify({ ...input, consent: false })))).status,
    400,
  );
  const response = await POST(request(JSON.stringify(input)));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.id, input.id);
  assert.equal(JSON.stringify(body).includes(input.bridePhone), false);
  assert.equal(response.headers.get("cache-control"), "no-store");
  for (let i = 0; i < 20; i++)
    assert.equal(await allowEnquiry("203.0.113.20"), true);
  assert.equal(await allowEnquiry("203.0.113.20"), false);
  const limits = await query("SELECT * FROM studio_request_limits");
  assert.equal(JSON.stringify(limits.rows).includes("203.0.113"), false);
});
