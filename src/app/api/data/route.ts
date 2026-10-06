import {
  checkOrigin,
  context,
  errorResponse,
  finance,
  HttpError,
  owner,
} from "@/lib/auth";
import { loadData, saveRecord, deleteRecord, audit } from "@/lib/service";
import { query, transaction, normalize } from "@/lib/db";
import { conflicts, fyRange, report, overdue, sum } from "@/lib/finance";
import { z } from "zod";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const ctx = await context();
    const company = normalize(
      (await query("SELECT * FROM companies WHERE id=$1", [ctx.companyId]))
        .rows[0],
    );
    const data = await loadData(ctx);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: company.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    for (const e of data.events) {
      const assignments = data.assignments.filter((a) => a.event_id === e.id);
      e.crew_count = assignments.length;
      e.team = assignments.map((a) => ({
        name: data.crew.find((c) => c.id === a.crew_id)?.name,
        role: a.role,
      }));
      if (ctx.role !== "Staff") {
        e.agreed_cost = sum(assignments);
        e.missing_rates = assignments.filter((a) => a.amount === null).length;
      }
    }
    for (const d of data.deliverables) d.overdue_days = overdue(d, today);
    for (const j of data.jobs) j.overdue_days = overdue(j, today, true);
    const url = new URL(req.url);
    const range = fyRange(today, company.fy_start);
    const from = url.searchParams.get("from") || range.from,
      to = url.searchParams.get("to") || range.to;
    z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .parse(from);
    z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .parse(to);
    if (from > to)
      throw new HttpError(400, "Start date must precede end date.");
    let reports: any = null;
    if (ctx.role !== "Staff") {
      reports = report(data, from, to, today);
      const previousFrom = `${Number(from.slice(0, 4)) - 1}${from.slice(4)}`,
        previousTo = `${Number(to.slice(0, 4)) - 1}${to.slice(4)}`;
      const prev = report(data, previousFrom, previousTo, today);
      reports.previous = {
        from: previousFrom,
        to: previousTo,
        contract: prev.contract,
        weddings: prev.weddings,
        netProfit: prev.netProfit,
        cashNet: prev.cashNet,
      };
    }
    const members =
      ctx.role === "Owner"
        ? (
            await query(
              "SELECT m.user_id,m.role,u.email FROM members m JOIN users u ON u.id=m.user_id WHERE m.company_id=$1",
              [ctx.companyId],
            )
          ).rows
        : [];
    const auditLog =
      ctx.role === "Owner"
        ? (
            await query(
              "SELECT entity,record_id,action,created_at,user_id FROM audit_log WHERE company_id=$1 ORDER BY created_at DESC LIMIT 100",
              [ctx.companyId],
            )
          ).rows.map(normalize)
        : [];
    return Response.json({
      company,
      role: ctx.role,
      data,
      reports,
      today,
      conflicts: conflicts(data.events, data.assignments),
      members,
      auditLog,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const ctx = await context();
    const b = await req.json();
    const row = await saveRecord(ctx, b.table, b.values, b.id);
    return Response.json({
      record: row,
      message:
        row.amount === null
          ? "Saved. Warning: no crew rate found; agree a rate before financial reporting."
          : "Saved successfully.",
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(req: Request) {
  try {
    checkOrigin(req);
    const ctx = await context();
    const b = await req.json();
    await deleteRecord(ctx, b.table, b.id);
    return Response.json({ message: "Record updated." });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH(req: Request) {
  try {
    checkOrigin(req);
    const ctx = await context();
    owner(ctx);
    const b = await req.json();
    const name = z.string().min(2).max(150).parse(b.name),
      currency = z
        .string()
        .regex(/^[A-Z]{3}$/)
        .parse(b.currency),
      fy = z.coerce.number().int().min(1).max(12).parse(b.fy_start);
    try {
      new Intl.DateTimeFormat("en", { timeZone: b.timezone });
    } catch {
      throw new HttpError(400, "Invalid timezone.");
    }
    const defaults = z
      .record(z.string(), z.array(z.string().min(1).max(100)).max(100))
      .parse(b.defaults);
    const logo = z
      .string()
      .max(2000)
      .parse(b.logo || "");
    if (logo && !logo.startsWith("https://"))
      throw new HttpError(400, "Logo must be an HTTPS URL.");
    await transaction(async (q) => {
      const before = (
        await q("SELECT * FROM companies WHERE id=$1", [ctx.companyId])
      ).rows[0];
      await q(
        "UPDATE companies SET name=$1,currency=$2,timezone=$3,fy_start=$4,defaults=$5,logo=$6,contact=$7 WHERE id=$8",
        [
          name,
          currency,
          b.timezone,
          fy,
          JSON.stringify(defaults),
          logo,
          String(b.contact || "").slice(0, 2000),
          ctx.companyId,
        ],
      );
      await audit(ctx, "company", ctx.companyId, "settings", before, b, q);
    });
    return Response.json({ message: "Settings saved." });
  } catch (e) {
    return errorResponse(e);
  }
}
