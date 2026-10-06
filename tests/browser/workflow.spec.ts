import { test, expect, APIRequestContext } from "@playwright/test";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
const pass = "Testing-MyWed-2026!";
function mailToken(email: string, action: string) {
  const folder = path.join(process.cwd(), ".data/mail");
  for (const f of readdirSync(folder)) {
    const m = JSON.parse(readFileSync(path.join(folder, f), "utf8"));
    if (m.email === email && m.subject === `MyWed ${action}`) {
      const u = new URL(m.body.match(/https?:\/\/\S+/)[0]);
      return new URLSearchParams(u.hash.slice(1)).get("token")!;
    }
  }
  throw new Error("Mail not delivered");
}
async function json(r: any) {
  const b = await r.json();
  expect(r.ok(), JSON.stringify(b)).toBeTruthy();
  return b;
}
async function save(
  api: APIRequestContext,
  table: string,
  values: any,
  id?: string,
) {
  return (
    await json(await api.post("/api/data", { data: { table, values, id } }))
  ).record;
}
test("sign-up → private workspace → shoot → production → delivery → reports, tenant boundaries and recovery", async ({
  page,
  playwright,
}) => {
  const email = `workflow-${Date.now()}@example.test`;
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(pass);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Verification");
  await page.goto(`/#action=verify&token=${mailToken(email, "verify")}`);
  await expect(page.getByRole("status")).toContainText("Email verified");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(pass);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your studio. Your workspace." }),
  ).toBeVisible();
  await page.getByLabel("Business name").fill("Fictional Workflow Studio");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    page.getByRole("heading", {
      name: "A little clarity. A lot of possibilities.",
    }),
  ).toBeVisible();
  const api = page.request;
  let d = await json(await api.get("/api/data"));
  const companyId = d.company.id;
  expect(d.data.clients).toHaveLength(0);
  await page.getByRole("button", { name: "New booking", exact: true }).click();
  await page.getByLabel("Bride name").fill("Fictional Mira");
  await page.getByLabel("Groom name").fill("Fictional Arjun");
  await page.getByLabel("Package amount", { exact: true }).fill("10000");
  await page.getByLabel("Booking date", { exact: true }).fill("2026-04-01");
  await page.getByLabel("Balance due by").fill("2026-09-01");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  d = await json(await api.get("/api/data"));
  const c = d.data.clients[0];
  expect(c.reference).toBe("MW-001");
  const crew = await save(api, "crew", {
    name: "Fictional Camera Operator",
    category: "Photographer",
  });
  const rate = await save(api, "rates", {
    crew_id: crew.id,
    role: "Photographer",
    event_type: "All functions",
    amount: "1000",
  });
  const e = await save(api, "events", {
    client_id: c.id,
    event_type: "Wedding Ceremony",
    date: "2026-10-10",
    start_time: "09:00",
    end_time: "14:00",
    venue: "Fictional Garden",
    status: "Assigned",
  });
  const a = await save(api, "assignments", {
    event_id: e.id,
    crew_id: crew.id,
    role: "Photographer",
  });
  expect(Number(a.amount)).toBe(100000);
  await save(api, "rates", { amount: "2000" }, rate.id);
  await save(api, "client_payments", {
    client_id: c.id,
    date: "2026-04-01",
    amount: "4000",
    type: "Advance",
  });
  await save(api, "crew_payments", {
    client_id: c.id,
    crew_id: crew.id,
    date: "2026-04-02",
    amount: "500",
    type: "Advance",
  });
  d = await json(await api.get("/api/data"));
  expect(d.reports.crew[0].advance).toBe(50000);
  expect(d.reports.crew[0].pending).toBe(0);
  await save(api, "events", { status: "Completed" }, e.id);
  const v = await save(api, "vendors", {
    name: "Fictional Album Vendor",
    type: "Album Designer",
  });
  const j = await save(api, "jobs", {
    client_id: c.id,
    vendor_id: v.id,
    work_type: "Album Designer",
    quantity: 1,
    amount: "500",
    date_sent: "2026-10-11",
    due_date: "2026-10-20",
  });
  await save(api, "vendor_payments", {
    job_id: j.id,
    date: "2026-10-12",
    type: "Advance",
    amount: "100",
  });
  await save(api, "vendor_payments", {
    job_id: j.id,
    date: "2026-10-19",
    type: "Final",
    amount: "400",
  });
  await save(
    api,
    "jobs",
    { date_received: "2026-10-19", status: "Approved" },
    j.id,
  );
  const album = await save(api, "albums", {
    client_id: c.id,
    name: "Fictional album",
    designer_id: v.id,
    designer_job_id: j.id,
    copies: 1,
  });
  const deliverable = await save(api, "deliverables", {
    client_id: c.id,
    type: "Highlight Film",
    quantity: 1,
    promised_date: "2026-10-25",
  });
  await save(
    api,
    "deliverables",
    { delivered_date: "2026-10-24", status: "Delivered" },
    deliverable.id,
  );
  await save(
    api,
    "albums",
    { delivered_date: "2026-10-24", status: "Delivered" },
    album.id,
  );
  await save(api, "client_payments", {
    client_id: c.id,
    date: "2026-10-24",
    type: "Final",
    amount: "6000",
  });
  await save(api, "crew_payments", {
    client_id: c.id,
    crew_id: crew.id,
    date: "2026-10-24",
    type: "Final",
    amount: "500",
  });
  await save(api, "expenses", {
    date: "2026-10-10",
    client_id: c.id,
    category: "Travel",
    amount: "100",
  });
  await save(api, "expenses", {
    date: "2026-10-01",
    category: "Software & Subscriptions",
    amount: "50",
  });
  await save(api, "clients", { status: "Delivered" }, c.id);
  d = await json(await api.get("/api/data?from=2026-04-01&to=2027-03-31"));
  const f = d.reports.clients[0].financial;
  expect(f.balance).toBe(0);
  expect(f.cost).toBe(160000);
  expect(f.profit).toBe(840000);
  expect(d.reports.netProfit).toBe(835000);
  expect(d.reports.crew[0].pending).toBe(0);
  expect(d.reports.vendors[0].balance).toBe(0);
  expect(Number(d.data.assignments[0].amount)).toBe(100000);
  await page.reload();
  for (const name of [
    "Clients",
    "Calendar",
    "Crew",
    "Payments",
    "Production",
    "Deliverables",
    "Albums",
    "Vendors",
    "Expenses",
    "Reports",
    "Settings",
    "Dashboard",
  ]) {
    await page
      .locator(".sidebar")
      .getByRole("button", { name, exact: true })
      .click();
    await expect(page.locator("h1")).toBeVisible();
  }
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Clients", exact: true })
    .click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Fictional Mira & Fictional Arjun" }),
  ).toBeVisible();
  const pdf = await api.get(`/api/pdf?client=${c.id}`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).slice(0, 4).toString()).toBe("%PDF");
  const xlsx = await api.get("/api/export?table=reports");
  expect(xlsx.status()).toBe(200);
  const exported = new ExcelJS.Workbook();
  await exported.xlsx.load((await xlsx.body()) as any);
  expect(exported.worksheets[0].rowCount).toBeGreaterThan(1);
  // Direct requests from a second company cannot read, write, export, or print first-company records.
  const other = await playwright.request.newContext({
      baseURL: "http://127.0.0.1:3000",
    }),
    email2 = `other-${Date.now()}@example.test`;
  await json(
    await other.post("/api/auth", {
      data: { action: "signup", email: email2, password: pass },
    }),
  );
  await json(
    await other.post("/api/auth", {
      data: { action: "verify", token: mailToken(email2, "verify") },
    }),
  );
  await json(
    await other.post("/api/auth", {
      data: { action: "login", email: email2, password: pass },
    }),
  );
  await json(
    await other.post("/api/auth", {
      data: { action: "create-company", name: "Fictional Other Studio" },
    }),
  );
  const od = await json(await other.get("/api/data"));
  expect(od.data.clients).toHaveLength(0);
  expect(
    (
      await other.post("/api/auth", {
        data: { action: "switch-company", company_id: companyId },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await other.post("/api/data", {
        data: { table: "clients", id: c.id, values: { bride: "Intruder" } },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await other.post("/api/data", {
        data: {
          table: "events",
          values: {
            client_id: c.id,
            event_type: "Wedding",
            date: "2026-11-01",
          },
        },
      })
    ).status(),
  ).toBe(400);
  expect((await other.get(`/api/pdf?client=${c.id}`)).status()).toBe(404);
  expect(
    await (await other.get("/api/export?table=clients&format=csv")).text(),
  ).not.toContain("Fictional Mira");
  // Invite a verified account to Staff; its financial APIs and exports are denied and responses redacted.
  await json(
    await api.post("/api/auth", {
      data: { action: "invite", email: email2, role: "Staff" },
    }),
  );
  await json(
    await other.post("/api/auth", {
      data: { action: "accept-invite", token: mailToken(email2, "invite") },
    }),
  );
  await json(
    await other.post("/api/auth", {
      data: { action: "switch-company", company_id: companyId },
    }),
  );
  const sd = await json(await other.get("/api/data"));
  expect(sd.role).toBe("Staff");
  expect(sd.reports).toBeNull();
  expect(sd.data.clients[0].package_amount).toBeUndefined();
  expect(sd.data.assignments[0].amount).toBeUndefined();
  expect((await other.get("/api/export?table=client_payments")).status()).toBe(
    403,
  );
  expect(
    (
      await other.post("/api/data", {
        data: {
          table: "client_payments",
          values: { client_id: c.id, date: "2026-10-01", amount: "1" },
        },
      })
    ).status(),
  ).toBe(403);
  // Password reset invalidates old sessions and one-time links cannot be reused.
  await json(
    await other.post("/api/auth", { data: { action: "reset", email: email2 } }),
  );
  const resetToken = mailToken(email2, "reset");
  await json(
    await other.post("/api/auth", {
      data: {
        action: "new-password",
        token: resetToken,
        password: "New-MyWed-password-2026!",
      },
    }),
  );
  expect((await other.get("/api/auth")).status()).toBe(401);
  expect(
    (
      await other.post("/api/auth", {
        data: { action: "new-password", token: resetToken, password: pass },
      })
    ).status(),
  ).toBe(400);
  await json(
    await other.post("/api/auth", {
      data: {
        action: "login",
        email: email2,
        password: "New-MyWed-password-2026!",
      },
    }),
  );
  await json(await other.post("/api/auth", { data: { action: "logout" } }));
  expect((await other.get("/api/data")).status()).toBe(401);
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Dashboard", exact: true })
    .click();
  mkdirSync(".data/screenshots", { recursive: true });
  await page.screenshot({
    path: ".data/screenshots/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".data/screenshots/dashboard-mobile.png",
    fullPage: true,
  });
  await other.dispose();
});

test("private workbook preview, full validation, workspace binding, reconciliation and duplicate prevention", async ({
  playwright,
}) => {
  const api = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3000",
  });
  await json(
    await api.post("/api/auth", {
      data: {
        action: "login",
        email: "demo@mywed.test",
        password: "MyWed-demo-2026!",
      },
    }),
  );
  await json(
    await api.post("/api/auth", {
      data: {
        action: "create-company",
        name: `Fictional Import ${Date.now()}`,
      },
    }),
  );
  const d = await json(await api.get("/api/data"));
  const companyId = d.company.id;
  const wb = new ExcelJS.Workbook();
  for (const s of [
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
    wb.addWorksheet(s);
  wb.getWorksheet("Clients")!.getRow(5).values = [
    null,
    null,
    "Confirmed",
    "Fictional Import Bride",
    "Fictional Import Groom",
    null,
    "0000000000",
    null,
    "import@example.test",
    null,
    "Referral",
    new Date("2026-04-01"),
    null,
    10000,
  ];
  wb.getWorksheet("Crew Directory")!.getRow(5).values = [
    "Fictional Import Crew",
    "Photographer",
  ];
  wb.getWorksheet("Crew Rates")!.getRow(5).values = [
    "Fictional Import Crew",
    "Photographer",
    "All functions",
    1000,
  ];
  wb.getWorksheet("Events & Crew")!.getRow(5).values = [
    "MW-001 | Fictional Import",
    "Wedding Ceremony",
    new Date("2026-10-10"),
    null,
    "Fictional Venue",
    "Completed",
    "Fictional Import Crew",
  ];
  wb.getWorksheet("Payments In")!.getRow(5).values = [
    "MW-001 | Fictional Import",
    new Date("2026-04-01"),
    "Advance",
    4000,
  ];
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const preview = await json(
    await api.post("/api/import", {
      multipart: {
        file: {
          name: "fictional.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer,
        },
      },
    }),
  );
  expect(preview.errors).toHaveLength(0);
  expect(preview.totals.contract).toBe(1000000);
  expect(preview.totals.crewCost).toBe(100000);
  expect((await json(await api.get("/api/data"))).data.clients).toHaveLength(0);
  expect(
    (
      await api.post("/api/import", {
        data: {
          previewId: preview.previewId,
          companyId,
          confirmPrivate: false,
        },
      })
    ).status(),
  ).toBe(400);
  await json(
    await api.post("/api/auth", {
      data: {
        action: "create-company",
        name: "Fictional Wrong Import Workspace",
      },
    }),
  );
  expect(
    (
      await api.post("/api/import", {
        data: { previewId: preview.previewId, companyId, confirmPrivate: true },
      })
    ).status(),
  ).toBe(400);
  await json(
    await api.post("/api/auth", {
      data: { action: "switch-company", company_id: companyId },
    }),
  );
  const result = await json(
    await api.post("/api/import", {
      data: { previewId: preview.previewId, companyId, confirmPrivate: true },
    }),
  );
  expect(result.summary.counts.clients).toBe(1);
  const after = await json(await api.get("/api/data"));
  expect(after.data.clients).toHaveLength(1);
  expect(after.reports.clients[0].financial.contract).toBe(
    preview.totals.contract,
  );
  expect(after.reports.clients[0].financial.crewCost).toBe(
    preview.totals.crewCost,
  );
  expect(after.data.events[0].client_id).toBe(after.data.clients[0].id);
  const duplicate = await json(
    await api.post("/api/import", {
      multipart: {
        file: {
          name: "fictional.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer,
        },
      },
    }),
  );
  expect(
    duplicate.errors.some((e: string) => e.includes("already")),
  ).toBeTruthy();
  await api.dispose();
});
