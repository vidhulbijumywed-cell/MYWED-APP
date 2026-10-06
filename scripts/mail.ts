import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
if (process.env.DATABASE_URL || process.env.NODE_ENV === "production")
  throw new Error("Local mail viewer is disabled for production databases.");
const dir = path.join(process.cwd(), ".data/mail");
try {
  const rows = readdirSync(dir)
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10);
  for (const r of rows)
    console.log(`${r.created_at}\nTo: ${r.email}\n${r.subject}\n${r.body}\n`);
} catch {
  console.log("No local account mail yet.");
}
