import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { hash, Context, HttpError } from "./auth";
import { Data, clientFinancial, minor, sum } from "./finance";
import { saveRecord } from "./service";
import { query, transaction } from "./db";
export type ImportRecord = {
  table: string;
  id: string;
  values: Record<string, any>;
  sheet: string;
  row: number;
};
export type Preview = {
  records: ImportRecord[];
  errors: string[];
  warnings: string[];
  counts: Record<string, number>;
  totals: Record<string, number>;
  fileHash: string;
  defaults: Record<string, string[]>;
};
function validateZip(buffer: Buffer) {
  if (buffer.length > 10 * 1024 * 1024)
    throw new HttpError(400, "Maximum workbook size is 10 MB.");
  let end = -1;
  for (
    let i = buffer.length - 22;
    i >= Math.max(0, buffer.length - 65557);
    i--
  ) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new HttpError(400, "Invalid XLSX ZIP archive.");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16),
    total = 0;
  if (count > 1000)
    throw new HttpError(400, "Workbook contains too many archive entries.");
  for (let i = 0; i < count; i++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== 0x02014b50
    )
      throw new HttpError(400, "Invalid archive directory.");
    total += buffer.readUInt32LE(offset + 24);
    if (total > 50 * 1024 * 1024)
      throw new HttpError(400, "Workbook expanded size exceeds 50 MB.");
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
}
export async function parseWorkbook(
  buffer: Buffer,
  existing: Data,
): Promise<Preview> {
  validateZip(buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const records: ImportRecord[] = [],
    errors: string[] = [],
    warnings: string[] = [];
  const fileHash = hash(buffer.toString("base64"));
  const clients = new Map<string, string>(),
    crew = new Map<string, string>(),
    vendors = new Map<string, string>();
  const seen = new Set<string>();
  for (const c of existing.clients || []) clients.set(c.reference, c.id);
  for (const c of existing.crew || [])
    crew.set(c.name.trim().toLowerCase(), c.id);
  for (const v of existing.vendors || [])
    vendors.set(v.name.trim().toLowerCase(), v.id);
  const cell = (sheet: string, r: number, c: number) => {
    const v = workbook.getWorksheet(sheet)?.getCell(r, c).value;
    if (v === null || v === undefined) return "";
    if (typeof v === "object" && !(v instanceof Date)) {
      if ("formula" in v || "sharedFormula" in v) return "";
      if ("richText" in v) return v.richText.map((t) => t.text).join("");
      if ("text" in v) return v.text;
      return "";
    }
    return v;
  };
  const text = (s: string, r: number, c: number) =>
    String(cell(s, r, c) ?? "").trim();
  const date = (s: string, r: number, c: number) => {
    const v = cell(s, r, c);
    if (!v) return null;
    if (v instanceof Date)
      return new Date(v.getTime() - v.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10);
    if (typeof v === "number") {
      return new Date(Date.UTC(1899, 11, 30) + v * 86400000)
        .toISOString()
        .slice(0, 10);
    }
    const st = String(v);
    const t = new Date(st);
    if (!isNaN(t.getTime())) return t.toISOString().slice(0, 10);
    errors.push(`${s} row ${r}: invalid date in column ${c}.`);
    return null;
  };
  const amount = (s: string, r: number, c: number) => {
    try {
      return minor(cell(s, r, c) || 0) || 0;
    } catch {
      errors.push(`${s} row ${r}: invalid amount in column ${c}.`);
      return 0;
    }
  };
  const time = (s: string, r: number, c: number) => {
    const v = cell(s, r, c);
    if (v === "") return null;
    if (v instanceof Date)
      return `${String(v.getUTCHours()).padStart(2, "0")}:${String(v.getUTCMinutes()).padStart(2, "0")}`;
    if (typeof v === "number") {
      const minutes = Math.round((v % 1) * 1440);
      return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    }
    const a = String(v).match(/^(\d{1,2}):(\d{2})/);
    return a ? `${a[1].padStart(2, "0")}:${a[2]}` : null;
  };
  const add = (
    table: string,
    values: Record<string, any>,
    sheet: string,
    row: number,
  ) => {
    const id = randomUUID();
    records.push({ table, id, values, sheet, row });
    return id;
  };
  const rows = (s: string, fn: (r: number) => void) => {
    const sh = workbook.getWorksheet(s);
    if (!sh) {
      errors.push(`Missing worksheet: ${s}`);
      return;
    }
    const end = sh.rowCount;
    if (end > 10000)
      throw new HttpError(
        400,
        `Worksheet ${s} exceeds the MVP import limit of 10,000 rows.`,
      );
    for (let r = 5; r <= end; r++) fn(r);
  };
  const ref = (s: string, r: number, c: number) => {
    const name = text(s, r, c);
    if (name === "GENERAL") return null;
    const key = name.split(" ")[0];
    const id = clients.get(key);
    if (!id)
      errors.push(`${s} row ${r}: unresolved client ${key || "(empty)"}.`);
    return id || null;
  };
  const person = (
    map: Map<string, string>,
    s: string,
    r: number,
    c: number,
  ) => {
    const name = text(s, r, c);
    const id = map.get(name.toLowerCase());
    if (name && !id)
      errors.push(`${s} row ${r}: unresolved directory name in column ${c}.`);
    return id || null;
  };
  rows("Clients", (r) => {
    const bride = text("Clients", r, 4),
      groom = text("Clients", r, 5);
    if (!bride && !groom) return;
    const reference =
      text("Clients", r, 1) || `MW-${String(r - 4).padStart(3, "0")}`;
    if (clients.has(reference)) {
      errors.push(
        `Clients row ${r}: reference ${reference} already exists. Import into an empty private workspace or resolve duplicates.`,
      );
      return;
    }
    if (seen.has(reference)) {
      errors.push(`Clients row ${r}: duplicate reference.`);
      return;
    }
    seen.add(reference);
    const id = add(
      "clients",
      {
        reference,
        bride,
        groom,
        status: text("Clients", r, 3) || "Confirmed",
        contact: text("Clients", r, 6),
        phone: text("Clients", r, 7),
        alternate_phone: text("Clients", r, 8),
        email: text("Clients", r, 9),
        address: text("Clients", r, 10),
        lead_source: text("Clients", r, 11),
        booking_date: date("Clients", r, 12),
        package_description: text("Clients", r, 13),
        package_amount: amount("Clients", r, 14),
        addons: amount("Clients", r, 15),
        discount: amount("Clients", r, 16),
        balance_due_date: date("Clients", r, 22),
        notes: text("Clients", r, 34),
      },
      "Clients",
      r,
    );
    clients.set(reference, id);
    if (text("Clients", r, 3) === "Cancelled")
      warnings.push(
        `Clients row ${r}: cancelled; cancellation charge defaults to zero. Review retained advances and refunds after import.`,
      );
  });
  rows("Crew Directory", (r) => {
    const s = "Crew Directory",
      name = text(s, r, 1);
    if (!name) return;
    if (crew.has(name.toLowerCase())) {
      warnings.push(`${s} row ${r}: reused existing directory name.`);
      return;
    }
    crew.set(
      name.toLowerCase(),
      add(
        "crew",
        {
          name,
          category: text(s, r, 2) || "Photographer",
          phone: text(s, r, 3),
          payment_details: text(s, r, 4),
          city: text(s, r, 5),
          notes: text(s, r, 6),
        },
        s,
        r,
      ),
    );
  });
  rows("Vendor Directory", (r) => {
    const s = "Vendor Directory",
      name = text(s, r, 1);
    if (!name) return;
    if (vendors.has(name.toLowerCase())) {
      warnings.push(`${s} row ${r}: reused existing directory name.`);
      return;
    }
    vendors.set(
      name.toLowerCase(),
      add(
        "vendors",
        {
          name,
          type: text(s, r, 2) || "Other",
          phone: text(s, r, 3),
          email: text(s, r, 4),
          payment_details: text(s, r, 5),
          address: text(s, r, 6),
          notes: text(s, r, 7),
        },
        s,
        r,
      ),
    );
  });
  const rateKeys = new Set(
    (existing.rates || []).map((x) => `${x.crew_id}|${x.role}|${x.event_type}`),
  );
  rows("Crew Rates", (r) => {
    const s = "Crew Rates";
    if (!text(s, r, 1)) return;
    const values = {
      crew_id: person(crew, s, r, 1),
      role: text(s, r, 2),
      event_type: text(s, r, 3) || "All functions",
      amount: amount(s, r, 4),
      notes: text(s, r, 5),
    };
    const key = `${values.crew_id}|${values.role}|${values.event_type}`;
    if (rateKeys.has(key)) errors.push(`${s} row ${r}: duplicate rate.`);
    rateKeys.add(key);
    add("rates", values, s, r);
  });
  rows("Events & Crew", (r) => {
    const s = "Events & Crew";
    if (!text(s, r, 1)) return;
    const event_type = text(s, r, 2);
    const eventDate = date(s, r, 3);
    if (!event_type || !eventDate)
      errors.push(`${s} row ${r}: event type and date are required.`);
    const id = add(
      "events",
      {
        client_id: ref(s, r, 1),
        event_type,
        date: eventDate,
        start_time: time(s, r, 4),
        venue: text(s, r, 5),
        status: text(s, r, 6) || "Assigned",
        notes: text(s, r, 29),
      },
      s,
      r,
    );
    for (let c = 7; c <= 18; c++) {
      if (!text(s, r, c)) continue;
      const role =
        c <= 10
          ? "Photographer"
          : c <= 13
            ? "Videographer"
            : c === 14
              ? "Live Streaming"
              : c === 15
                ? "Drone"
                : c === 16
                  ? "Social Media Creator"
                  : "Assistant";
      add(
        "assignments",
        { event_id: id, crew_id: person(crew, s, r, c), role },
        s,
        r,
      );
    }
  });
  rows("Payments In", (r) => {
    const s = "Payments In";
    if (!text(s, r, 1)) return;
    add(
      "client_payments",
      {
        client_id: ref(s, r, 1),
        date: date(s, r, 2),
        type: text(s, r, 3) || "Advance",
        amount: amount(s, r, 4),
        mode: text(s, r, 5),
        reference: text(s, r, 6),
        notes: text(s, r, 7),
      },
      s,
      r,
    );
  });
  rows("Crew Payments", (r) => {
    const s = "Crew Payments";
    if (!text(s, r, 2)) return;
    add(
      "crew_payments",
      {
        date: date(s, r, 1),
        client_id: ref(s, r, 2),
        crew_id: person(crew, s, r, 3),
        type: text(s, r, 4) || "Advance",
        amount: amount(s, r, 5),
        mode: text(s, r, 6),
        reference: text(s, r, 7),
        notes: text(s, r, 8),
      },
      s,
      r,
    );
  });
  rows("Post-Production", (r) => {
    const s = "Post-Production";
    if (!text(s, r, 1)) return;
    const id = add(
      "jobs",
      {
        client_id: ref(s, r, 1),
        work_type: text(s, r, 2) || "Other",
        vendor_id: person(vendors, s, r, 3),
        description: text(s, r, 4),
        quantity: Number(cell(s, r, 5) || 1),
        amount: amount(s, r, 6),
        date_sent: date(s, r, 11),
        due_date: date(s, r, 12),
        date_received: date(s, r, 13),
        status: text(s, r, 14) || "Not Started",
        notes: text(s, r, 15),
      },
      s,
      r,
    );
    for (const [c, type] of [
      [7, "Advance"],
      [8, "Final"],
    ] as const) {
      const paid = amount(s, r, c);
      if (paid > 0) {
        add(
          "vendor_payments",
          {
            job_id: id,
            type,
            amount: paid,
            date: null,
            notes:
              "Imported historical payment: workbook has no transaction date.",
          },
          s,
          r,
        );
        warnings.push(
          `${s} row ${r}: ${type} payment has no date; excluded from dated cash reports until corrected.`,
        );
      }
    }
  });
  rows("Expenses", (r) => {
    const s = "Expenses";
    if (!text(s, r, 2) && !text(s, r, 5) && !cell(s, r, 6)) return;
    add(
      "expenses",
      {
        date: date(s, r, 1),
        client_id: ref(s, r, 2),
        category: text(s, r, 4) || "Miscellaneous",
        description: text(s, r, 5),
        amount: amount(s, r, 6),
        paid_by: text(s, r, 7),
        mode: text(s, r, 8),
        reference: text(s, r, 9),
      },
      s,
      r,
    );
  });
  rows("Deliverables", (r) => {
    const s = "Deliverables";
    if (!text(s, r, 1)) return;
    add(
      "deliverables",
      {
        client_id: ref(s, r, 1),
        type: text(s, r, 2) || "Other",
        specifications: text(s, r, 3),
        quantity: Number(cell(s, r, 4) || 1),
        promised_date: date(s, r, 5),
        delivered_date: date(s, r, 6),
        status: text(s, r, 7) || "Not Started",
        notes: text(s, r, 9),
      },
      s,
      r,
    );
  });
  rows("Albums", (r) => {
    const s = "Albums";
    if (!text(s, r, 1)) return;
    add(
      "albums",
      {
        client_id: ref(s, r, 1),
        name: text(s, r, 2) || "Main album",
        style: text(s, r, 3),
        size: text(s, r, 4),
        pages: Number(cell(s, r, 5) || 0),
        material: text(s, r, 6),
        copies: Number(cell(s, r, 7) || 1),
        designer_id: person(vendors, s, r, 8),
        printer_id: person(vendors, s, r, 9),
        selection_sent: date(s, r, 10),
        design_approved: date(s, r, 11),
        print_sent: date(s, r, 12),
        delivered_date: date(s, r, 13),
        status: text(s, r, 14) || "Selection Pending",
        notes: text(s, r, 15),
      },
      s,
      r,
    );
  });
  const data: Data = Object.fromEntries(
    Object.entries(existing).map(([k, v]) => [k, [...v]]),
  );
  for (const rec of records)
    (data[rec.table] ??= []).push({ id: rec.id, ...rec.values });
  for (const a of data.assignments || []) {
    if (a.amount !== undefined) continue;
    const event = data.events.find((e) => e.id === a.event_id);
    const rate =
      data.rates?.find(
        (r) =>
          r.crew_id === a.crew_id &&
          r.role === a.role &&
          r.event_type === event?.event_type,
      ) ??
      data.rates?.find(
        (r) =>
          r.crew_id === a.crew_id &&
          r.role === a.role &&
          r.event_type === "All functions",
      );
    a.amount = rate?.amount ?? null;
    if (a.amount === null)
      warnings.push(
        "Missing agreed crew rate. Cost totals are incomplete until rates are resolved.",
      );
  }
  const counts: Record<string, number> = {};
  for (const r of records) counts[r.table] = (counts[r.table] || 0) + 1;
  const totals = {
    contract: sum(
      (data.clients || []).map((c) => clientFinancial(c, data)),
      "contract",
    ),
    received: sum(
      (data.clients || []).map((c) => clientFinancial(c, data)),
      "received",
    ),
    crewCost: sum(data.assignments || []),
    productionCost: sum(data.jobs || []),
    expenses: sum(data.expenses || []),
  };
  const defaults: Record<string, string[]> = {};
  for (let c = 7; c <= 20; c++) {
    const key = text("Setup", 4, c);
    if (key)
      defaults[key] = Array.from({ length: 20 }, (_, i) =>
        text("Setup", i + 5, c),
      ).filter(Boolean);
  }
  return {
    records,
    errors,
    warnings: [...new Set(warnings)],
    counts,
    totals,
    fileHash,
    defaults,
  };
}
export async function commitPreview(
  ctx: Context,
  preview: Preview,
  dryRun = false,
) {
  if (preview.errors.length)
    throw new HttpError(400, "Resolve validation errors before importing.");
  const dryResult = {};
  try {
    return await transaction(async (q) => {
      if (
        (
          await q(
            "SELECT id FROM imports WHERE company_id=$1 AND file_hash=$2",
            [ctx.companyId, preview.fileHash],
          )
        ).rows.length
      )
        throw new HttpError(409, "This workbook has already been imported.");
      if (Object.keys(preview.defaults).length) {
        const company = (
          await q("SELECT defaults FROM companies WHERE id=$1", [ctx.companyId])
        ).rows[0];
        await q("UPDATE companies SET defaults=$1 WHERE id=$2", [
          JSON.stringify({ ...company.defaults, ...preview.defaults }),
          ctx.companyId,
        ]);
      }
      const mapping = new Map<string, string>();
      for (const r of preview.records) {
        const v = { ...r.values };
        for (const [k, value] of Object.entries(v))
          if (
            k.endsWith("_id") &&
            typeof value === "string" &&
            mapping.has(value)
          )
            v[k] = mapping.get(value);
        let saved: any;
        try {
          saved = await saveRecord(ctx, r.table, v, undefined, q, true);
        } catch (e) {
          throw new HttpError(
            400,
            `${r.sheet} row ${r.row}: ${e instanceof Error ? e.message : "Invalid record."}`,
          );
        }
        mapping.set(r.id, saved.id);
      }
      const summary = {
        counts: preview.counts,
        totals: preview.totals,
        warnings: preview.warnings,
      };
      await q(
        "INSERT INTO imports(id,company_id,file_hash,summary) VALUES($1,$2,$3,$4)",
        [
          randomUUID(),
          ctx.companyId,
          preview.fileHash,
          JSON.stringify(summary),
        ],
      );
      if (dryRun) throw dryResult;
      return summary;
    });
  } catch (e) {
    if (e === dryResult) return { validated: true };
    throw e;
  }
}
