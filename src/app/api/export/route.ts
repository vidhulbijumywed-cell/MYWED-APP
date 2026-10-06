import ExcelJS from "exceljs";
import { context, errorResponse, finance, HttpError } from "@/lib/auth";
import { loadData } from "@/lib/service";
import { models } from "@/lib/models";
import { fyRange, report } from "@/lib/finance";
import { query } from "@/lib/db";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const ctx = await context();
    const u = new URL(req.url);
    const table = u.searchParams.get("table") || "clients",
      format = u.searchParams.get("format") || "xlsx";
    const data = await loadData(ctx);
    let sheets: Record<string, any[]> = {};
    if (table === "reports") {
      finance(ctx);
      const c = (
        await query("SELECT * FROM companies WHERE id=$1", [ctx.companyId])
      ).rows[0];
      const range = fyRange(new Date().toISOString().slice(0, 10), c.fy_start);
      const r = report(
        data,
        u.searchParams.get("from") || range.from,
        u.searchParams.get("to") || range.to,
        new Date().toISOString().slice(0, 10),
      );
      sheets = {
        cohort: r.cohort.map((c) => ({
          reference: c.reference,
          bride: c.bride,
          groom: c.groom,
          ...c.financial,
        })),
        cash: [
          {
            from: r.from,
            to: r.to,
            inflows: r.inflows,
            outflows: r.outflows,
            net: r.cashNet,
          },
        ],
        monthly: r.monthly,
        crew: r.crew,
        vendors: r.vendors,
      };
    } else {
      if (!models[table]) throw new HttpError(400, "Unknown export module.");
      if (models[table].financial) finance(ctx);
      sheets = { [table]: data[table] };
    }
    // Protect spreadsheet consumers against formula injection. Monetary columns are integer minor units, clearly named in exports.
    const workbook = new ExcelJS.Workbook();
    for (const [name, rows] of Object.entries(sheets)) {
      const safe = rows.map((r) =>
        Object.fromEntries(
          Object.entries(r).map(([k, v]) => [
            k,
            typeof v === "string" && /^[=+@\-\t\r]/.test(v) ? `'${v}` : v,
          ]),
        ),
      );
      const sheet = workbook.addWorksheet(name.slice(0, 31));
      const keys = [...new Set(safe.flatMap((r) => Object.keys(r)))];
      sheet.addRow(keys);
      for (const row of safe)
        sheet.addRow(
          keys.map((k) =>
            typeof row[k] === "object" ? JSON.stringify(row[k]) : row[k],
          ),
        );
      sheet.getRow(1).font = { bold: true };
    }
    const csv = format === "csv";
    const result = csv
      ? await workbook.csv.writeBuffer({
          sheetName: workbook.worksheets[0].name,
        })
      : await workbook.xlsx.writeBuffer();
    return new Response(Buffer.from(result), {
      headers: {
        "Content-Type": csv
          ? "text/csv; charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="mywed-${table}-minor-units.${csv ? "csv" : "xlsx"}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
