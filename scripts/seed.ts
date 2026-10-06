import { randomUUID } from "node:crypto";
import { query } from "../src/lib/db";
import { passwordHash, Context } from "../src/lib/auth";
import { saveRecord } from "../src/lib/service";
import defaults from "../docs/workbook-defaults.json";
if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL)
  throw new Error("Fictional demo seed is local-only.");
const email = "demo@mywed.test",
  password = "MyWed-demo-2026!";
if ((await query("SELECT id FROM users WHERE email=$1", [email])).rows.length) {
  console.log("Demo already seeded.");
  process.exit(0);
}
const user = randomUUID(),
  company = randomUUID();
await query(
  "INSERT INTO users(id,email,password_hash,verified) VALUES($1,$2,$3,true)",
  [user, email, passwordHash(password)],
);
await query("INSERT INTO companies(id,name,defaults) VALUES($1,$2,$3)", [
  company,
  "The Frame Studio",
  JSON.stringify(defaults),
]);
await query("INSERT INTO members VALUES($1,$2,'Owner')", [company, user]);
const ctx: Context = { userId: user, companyId: company, role: "Owner", email };
const client = await saveRecord(ctx, "clients", {
  bride: "Mira",
  groom: "Arjun",
  contact: "Mira",
  phone: "0000000000",
  email: "mira@example.test",
  lead_source: "Referral",
  booking_date: "2026-07-12",
  package_description:
    "Two days of photography and films, online gallery, and one heirloom album.",
  package_amount: "180000",
  addons: "15000",
  discount: "5000",
  balance_due_date: "2026-11-30",
  status: "Confirmed",
});
const crew = await saveRecord(ctx, "crew", {
  name: "Riya (fictional)",
  category: "Photographer",
  city: "Bengaluru",
  phone: "0000000000",
});
await saveRecord(ctx, "rates", {
  crew_id: crew.id,
  role: "Photographer",
  event_type: "All functions",
  amount: "12000",
});
const event = await saveRecord(ctx, "events", {
  client_id: client.id,
  event_type: "Wedding Ceremony",
  date: "2026-11-15",
  start_time: "08:00",
  end_time: "15:00",
  venue: "Fictional Garden Venue",
  status: "Assigned",
});
await saveRecord(ctx, "assignments", {
  crew_id: crew.id,
  event_id: event.id,
  role: "Photographer",
});
await saveRecord(ctx, "client_payments", {
  client_id: client.id,
  date: "2026-07-15",
  type: "Advance",
  amount: "50000",
  mode: "Bank Transfer",
});
const vendor = await saveRecord(ctx, "vendors", {
  name: "Paper & Frame (fictional)",
  type: "Album Designer",
});
const job = await saveRecord(ctx, "jobs", {
  client_id: client.id,
  vendor_id: vendor.id,
  work_type: "Album Designer",
  amount: "8000",
  due_date: "2026-12-10",
  status: "Not Started",
});
await saveRecord(ctx, "albums", {
  client_id: client.id,
  name: "Heirloom album",
  style: "Layflat",
  size: "12 × 12",
  pages: 40,
  copies: 1,
  designer_id: vendor.id,
  designer_job_id: job.id,
  status: "Selection Pending",
});
await saveRecord(ctx, "deliverables", {
  client_id: client.id,
  type: "Highlight Film",
  quantity: 1,
  promised_date: "2026-12-15",
  status: "Not Started",
});
await saveRecord(ctx, "expenses", {
  date: "2026-07-01",
  category: "Software & Subscriptions",
  amount: "3000",
  description: "Fictional monthly tools",
});
console.log(
  `Fictional demo ready. Log in as ${email} with ${password}. Choose The Frame Studio.`,
);
process.exit(0);
