import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import {
  chooseRate,
  clientFinancial,
  crewBalance,
  conflicts,
  fyRange,
  minor,
  overdue,
  report,
} from "../src/lib/finance";
import { query } from "../src/lib/db";
import { loadData, saveRecord, deleteRecord } from "../src/lib/service";
import { commitPreview, parseWorkbook } from "../src/lib/importer";
import { Context, passwordHash, checkPassword } from "../src/lib/auth";
process.env.MYWED_DATA_DIR = mkdtempSync(path.join(tmpdir(), "mywed-test-"));
import defaults from "../docs/workbook-defaults.json";
const uuid = randomUUID;
async function workspace(name: string) {
  const user = uuid(),
    company = uuid();
  await query("INSERT INTO users(id,email,verified) VALUES($1,$2,true)", [
    user,
    user + "@example.test",
  ]);
  await query("INSERT INTO companies(id,name,defaults) VALUES($1,$2,$3)", [
    company,
    name,
    JSON.stringify({ ...defaults, Events: [...defaults.Events, "Wedding"] }),
  ]);
  await query("INSERT INTO members VALUES($1,$2,'Owner')", [company, user]);
  return {
    userId: user,
    companyId: company,
    role: "Owner",
    email: user + "@example.test",
  } as Context;
}
test("integer money, valid zero rate, pending and advance handling", () => {
  assert.equal(minor("123.45"), 12345);
  assert.equal(minor("0"), 0);
  assert.throws(() => minor("1.234"));
  assert.equal(
    chooseRate(
      [
        {
          crew_id: "a",
          role: "Photo",
          event_type: "All functions",
          amount: 100,
        },
        { crew_id: "a", role: "Photo", event_type: "Wedding", amount: 0 },
      ],
      "a",
      "Photo",
      "Wedding",
    ),
    0,
  );
  assert.equal(chooseRate([], "a", "Photo", "Wedding"), null);
  assert.deepEqual(crewBalance(100, 50, 80), {
    assigned: 100,
    completed: 50,
    paid: 80,
    pending: 0,
    advance: 30,
  });
});
test("financial rules distinguish refunds, overheads, album jobs, and cash dates", () => {
  const c = {
    id: "c",
    package_amount: 10000,
    addons: 2000,
    discount: 1000,
    booking_date: "2026-03-20",
    status: "Confirmed",
  };
  const d = {
    clients: [c],
    events: [
      { id: "e", client_id: "c", date: "2026-04-01", status: "Completed" },
    ],
    assignments: [{ event_id: "e", amount: 2000 }],
    jobs: [{ id: "j", client_id: "c", amount: 1000 }],
    albums: [{ client_id: "c", designer_job_id: "j" }],
    client_payments: [
      { client_id: "c", date: "2026-03-25", type: "Advance", amount: 5000 },
      { client_id: "c", date: "2026-04-05", type: "Final", amount: 7000 },
      { client_id: "c", date: "2026-04-06", type: "Refund", amount: 500 },
    ],
    expenses: [
      { client_id: "c", date: "2026-04-01", amount: 1000 },
      { client_id: null, date: "2026-04-02", amount: 500 },
    ],
    vendor_payments: [{ job_id: "j", date: "2026-04-04", amount: 400 }],
    crew_payments: [],
    crew: [],
    vendors: [],
    deliverables: [],
  };
  const f = clientFinancial(c, d);
  assert.equal(f.contract, 11000);
  assert.equal(f.received, 11500);
  assert.equal(f.balance, -500);
  assert.equal(f.cost, 4000);
  assert.equal(f.profit, 7000);
  assert.equal(f.cohortDate, "2026-04-01");
  const r = report(d, "2026-04-01", "2027-03-31", "2026-10-01");
  assert.equal(r.netProfit, 6500);
  assert.equal(r.inflows, 7000);
  assert.equal(r.outflows, 2400);
  assert.equal(r.cashNet, 4600);
  assert.deepEqual(fyRange("2026-03-31"), {
    from: "2025-04-01",
    to: "2026-03-31",
  });
  assert.deepEqual(fyRange("2026-04-01"), {
    from: "2026-04-01",
    to: "2027-03-31",
  });
  const cancelled = clientFinancial(
    { ...c, status: "Cancelled", cancellation_value: 2000 },
    d,
  );
  assert.equal(cancelled.contract, 2000);
  assert.equal(cancelled.cost, 4000);
  assert.equal(cancelled.profit, -2000);
  assert.equal(cancelled.received, 11500);
  assert.equal(
    clientFinancial(
      { ...c, package_amount: 0, addons: 0, discount: 0 },
      { events: [] },
    ).margin,
    0,
  );
});
test("overdue completion and scheduling overlap distinctions", () => {
  assert.equal(
    overdue(
      { promised_date: "2026-10-01", status: "In Progress" },
      "2026-10-06",
    ),
    5,
  );
  assert.equal(
    overdue({ promised_date: "2026-10-01", status: "Delivered" }, "2026-10-06"),
    0,
  );
  const events = [
    { id: "a", date: "2026-10-01", start_time: "09:00", end_time: "12:00" },
    { id: "b", date: "2026-10-01", start_time: "11:00", end_time: "13:00" },
  ];
  assert.equal(
    conflicts(events, [
      { event_id: "a", crew_id: "x" },
      { event_id: "b", crew_id: "x" },
    ])[0].severity,
    "Confirmed time overlap",
  );
  assert.equal(
    conflicts(
      [{ ...events[0], end_time: null }, events[1]],
      [
        { event_id: "a", crew_id: "x" },
        { event_id: "b", crew_id: "x" },
      ],
    )[0].severity,
    "Possible same-day conflict",
  );
  assert.equal(
    conflicts(
      [events[0], { ...events[1], start_time: "12:00" }],
      [
        { event_id: "a", crew_id: "x" },
        { event_id: "b", crew_id: "x" },
      ],
    ).length,
    0,
  );
});
test("database tenant isolation, stable IDs, roles, snapshots, and audit", async () => {
  const a = await workspace("A"),
    b = await workspace("B");
  const c = await saveRecord(a, "clients", {
    bride: "Fictional A",
    package_amount: "1000",
    booking_date: "2026-01-01",
  });
  const c2 = await saveRecord(a, "clients", { bride: "Fictional B" });
  await deleteRecord(a, "clients", c.id);
  assert.equal(
    (await loadData(a)).clients.find((r) => r.id === c2.id)?.reference,
    "MW-002",
  );
  await assert.rejects(() =>
    saveRecord(b, "clients", { bride: "Intruder" }, c.id),
  );
  await assert.rejects(() =>
    saveRecord(b, "events", {
      client_id: c.id,
      event_type: "Wedding",
      date: "2026-11-01",
    }),
  );
  assert.equal((await loadData(b)).clients.length, 0);
  const member = await saveRecord(a, "crew", { name: "Fictional crew" });
  const rate = await saveRecord(a, "rates", {
    crew_id: member.id,
    role: "Photographer",
    event_type: "All functions",
    amount: "100",
  });
  const zero = await saveRecord(a, "rates", {
    crew_id: member.id,
    role: "Photographer",
    event_type: "Wedding",
    amount: "0",
  });
  const e = await saveRecord(a, "events", {
    client_id: c.id,
    event_type: "Wedding",
    date: "2026-11-01",
  });
  const assignment = await saveRecord(a, "assignments", {
    event_id: e.id,
    crew_id: member.id,
    role: "Photographer",
  });
  assert.equal(Number(assignment.amount), 0);
  await saveRecord(a, "rates", { amount: "200" }, zero.id);
  assert.equal(Number((await loadData(a)).assignments[0].amount), 0);
  await assert.rejects(() =>
    saveRecord(a, "assignments", { amount: "10" }, assignment.id),
  );
  await saveRecord(
    a,
    "assignments",
    { amount: "10", override_reason: "Agreed extra coverage" },
    assignment.id,
  );
  await saveRecord(a, "client_payments", {
    client_id: c.id,
    date: "2026-10-06",
    amount: "300",
    type: "Advance",
  });
  await saveRecord(a, "client_payments", {
    client_id: c.id,
    date: "2026-10-07",
    amount: "800",
    type: "Final",
  });
  assert.equal(
    clientFinancial(
      (await loadData(a)).clients.find((r) => r.id === c.id),
      await loadData(a),
    ).balance,
    -10000,
  );
  const staff = { ...a, role: "Staff" };
  const staffData = await loadData(staff);
  assert.equal(staffData.client_payments.length, 0);
  assert.equal(staffData.clients[0].package_amount, undefined);
  assert.equal(staffData.assignments[0].amount, undefined);
  assert.equal(
    (await saveRecord(staff, "assignments", {}, assignment.id)).amount,
    undefined,
  );
  await assert.rejects(() =>
    saveRecord(staff, "client_payments", {
      client_id: c.id,
      date: "2026-10-06",
      amount: "1",
    }),
  );
  await assert.rejects(() =>
    saveRecord(staff, "assignments", { amount: "1" }, assignment.id),
  );
  await assert.rejects(() =>
    saveRecord(a, "crew_payments", {
      client_id: c2.id,
      crew_id: member.id,
      date: "2026-10-06",
      amount: "1",
    }),
  );
  const logs = (
    await query("SELECT * FROM audit_log WHERE company_id=$1", [a.companyId])
  ).rows;
  assert.ok(
    logs.some((r) => r.action === "update" && r.entity === "assignments"),
  );
  const paymentId = (await loadData(a)).client_payments[0].id;
  await assert.rejects(() => deleteRecord(a, "client_payments", paymentId));
});
test("transactional workbook import preserves relationships and totals, rejects duplicates", async () => {
  const ctx = await workspace("Import");
  const wb = new ExcelJS.Workbook();
  for (const n of [
    "Clients",
    "Crew Directory",
    "Vendor Directory",
    "Crew Rates",
    "Events & Crew",
    "Payments In",
    "Crew Payments",
    "Post-Production",
    "Expenses",
    "Deliverables",
    "Albums",
    "Setup",
  ])
    wb.addWorksheet(n);
  const row = (s: string, values: any[]) => {
    wb.getWorksheet(s)!.getRow(5).values = values;
  };
  row("Clients", [
    { formula: '"MW-001"' },
    null,
    "Confirmed",
    "Demo Bride",
    "Demo Groom",
    null,
    "0000000000",
    null,
    "bride@example.test",
    null,
    "Referral",
    new Date("2026-01-01"),
    null,
    1000,
    100,
    50,
  ]);
  row("Crew Directory", ["Demo crew", "Photographer"]);
  row("Crew Rates", ["Demo crew", "Photographer", "All functions", 100]);
  row("Events & Crew", [
    "MW-001 | Demo Bride & Demo Groom",
    "Wedding",
    new Date("2026-04-01"),
    0.5,
    "Demo venue",
    "Completed",
    "Demo crew",
  ]);
  row("Payments In", [
    "MW-001 | Demo Bride & Demo Groom",
    new Date("2026-03-01"),
    "Advance",
    500,
    "UPI",
  ]);
  row("Vendor Directory", ["Demo vendor", "Album Designer"]);
  row("Post-Production", [
    "MW-001 | Demo Bride & Demo Groom",
    "Album Designer",
    "Demo vendor",
    "Album",
    1,
    200,
    50,
    100,
    null,
    null,
    new Date("2026-04-02"),
    new Date("2026-05-01"),
  ]);
  row("Albums", [
    "MW-001 | Demo Bride & Demo Groom",
    "Album",
    "Layflat",
    "12x12",
    20,
    "Linen",
    1,
    "Demo vendor",
  ]);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const preview = await parseWorkbook(buffer, await loadData(ctx));
  assert.equal(preview.errors.length, 0);
  assert.equal(preview.counts.clients, 1);
  assert.equal(preview.counts.assignments, 1);
  assert.equal(preview.totals.contract, 105000);
  assert.equal(preview.totals.crewCost, 10000);
  assert.ok(preview.warnings.some((w) => w.includes("no date")));
  await commitPreview(ctx, preview);
  const data = await loadData(ctx);
  const f = clientFinancial(data.clients[0], data);
  assert.equal(f.contract, preview.totals.contract);
  assert.equal(f.crewCost, preview.totals.crewCost);
  assert.equal(f.jobCost, 20000);
  assert.equal(f.vendorPaid, 15000);
  assert.equal(f.cost, 30000);
  assert.equal(data.clients[0].reference, "MW-001");
  assert.equal(data.clients[0].phone, "0000000000");
  assert.equal(data.events[0].client_id, data.clients[0].id);
  await assert.rejects(() => commitPreview(ctx, preview));
  const bad = await parseWorkbook(buffer, await loadData(ctx));
  assert.ok(bad.errors.length > 0);
  const fresh = await workspace("Rollback");
  const broken = {
    ...preview,
    fileHash: uuid(),
    records: [
      ...preview.records,
      {
        table: "events",
        id: uuid(),
        values: { client_id: uuid(), event_type: "X", date: "2026-01-01" },
        sheet: "Events & Crew",
        row: 6,
      },
    ],
  };
  await assert.rejects(() => commitPreview(fresh, broken));
  assert.equal((await loadData(fresh)).clients.length, 0);
});
test("passwords are salted and verified without plaintext storage", () => {
  const a = passwordHash("secure-password-example"),
    b = passwordHash("secure-password-example");
  assert.notEqual(a, b);
  assert.equal(checkPassword("secure-password-example", a), true);
  assert.equal(checkPassword("incorrect-password", a), false);
});
