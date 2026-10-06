import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { context, errorResponse, finance, HttpError } from "@/lib/auth";
import { loadData } from "@/lib/service";
import { clientFinancial } from "@/lib/finance";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const ctx = await context();
    finance(ctx);
    const u = new URL(req.url),
      id = u.searchParams.get("client"),
      internal = u.searchParams.get("internal") === "true";
    const d = await loadData(ctx),
      c = d.clients.find((r) => r.id === id);
    if (!c) throw new HttpError(404, "Client not found.");
    const f = clientFinancial(c, d);
    const doc = await PDFDocument.create();
    let page = doc.addPage([595, 842]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    let y = 790;
    function line(v: string, size = 11) {
      const safe = v.replace(/[^\x20-\x7E]/g, " ");
      for (let i = 0; i < safe.length; i += 85) {
        if (y < 50) {
          page = doc.addPage([595, 842]);
          y = 790;
        }
        page.drawText(safe.slice(i, i + 85), {
          x: 48,
          y,
          size,
          font,
          color: rgb(0.15, 0.2, 0.2),
        });
        y -= size + 9;
      }
    }
    const money = (n: number) => (n / 100).toFixed(2);
    line("MyWed | " + (internal ? "INTERNAL SUMMARY" : "CLIENT SUMMARY"), 19);
    line(`${c.reference} | ${c.bride} & ${c.groom}`, 16);
    line(c.contact + " | " + c.phone + " | " + c.email);
    line("Package: " + c.package_description);
    line(
      `Contract: ${money(f.contract)} | Received: ${money(f.received)} | Balance: ${money(f.balance)}`,
    );
    line("EVENTS", 14);
    for (const e of d.events.filter((r) => r.client_id === c.id))
      line(
        `${String(e.date).slice(0, 10)} ${e.event_type} | ${e.venue} | ${e.status}`,
      );
    line("DELIVERABLES", 14);
    for (const r of d.deliverables.filter((r) => r.client_id === c.id))
      line(
        `${r.type} x${r.quantity} | ${r.specifications} | Due: ${r.promised_date || "-"} | ${r.status}`,
      );
    line("ALBUMS", 14);
    for (const r of d.albums.filter((r) => r.client_id === c.id))
      line(`${r.name} | ${r.style} ${r.size} | ${r.pages} pages | ${r.status}`);
    line("PAYMENTS", 14);
    for (const p of d.client_payments.filter((r) => r.client_id === c.id))
      line(`${p.date} ${p.type} ${money(p.amount)} ${p.mode}`);
    if (internal) {
      line("PRIVATE FINANCIALS", 14);
      line(
        `Crew cost ${money(f.crewCost)} | Production ${money(f.jobCost)} | Expenses ${money(f.expense)}`,
      );
      line(
        `Expected profit ${money(f.profit)} | Margin ${f.margin.toFixed(1)}%`,
      );
      line("Internal notes: " + c.notes);
      for (const j of d.jobs.filter((r) => r.client_id === c.id))
        line(
          `Production: ${j.work_type} | agreed ${money(j.amount)} | ${j.status}`,
        );
    }
    return new Response(Buffer.from(await doc.save()), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${c.reference}-${internal ? "internal" : "client"}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
