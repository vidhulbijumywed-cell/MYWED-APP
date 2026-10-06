import { randomUUID } from "node:crypto";
import {
  checkOrigin,
  context,
  errorResponse,
  finance,
  HttpError,
} from "@/lib/auth";
import { loadData } from "@/lib/service";
import { commitPreview, parseWorkbook } from "@/lib/importer";
import { query } from "@/lib/db";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const ctx = await context();
    finance(ctx);
    if (!["Owner", "Manager"].includes(ctx.role))
      throw new HttpError(403, "Only owners and managers can import.");
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File) || !file.name.endsWith(".xlsx"))
        throw new HttpError(400, "Choose an XLSX workbook.");
      if (file.size > 10 * 1024 * 1024)
        throw new HttpError(400, "Maximum workbook size is 10 MB.");
      const preview = await parseWorkbook(
        Buffer.from(await file.arrayBuffer()),
        await loadData(ctx),
      );
      if (
        (
          await query(
            "SELECT id FROM imports WHERE company_id=$1 AND file_hash=$2",
            [ctx.companyId, preview.fileHash],
          )
        ).rows.length
      )
        preview.errors.push("This exact workbook has already been imported.");
      if (!preview.errors.length) {
        try {
          await commitPreview(ctx, preview, true);
        } catch (e) {
          preview.errors.push(
            e instanceof Error ? e.message : "Validation failed.",
          );
        }
      }
      const id = randomUUID();
      await query(
        "INSERT INTO import_previews VALUES($1,$2,$3,$4,$5,now()+interval '1 hour')",
        [
          id,
          ctx.companyId,
          ctx.userId,
          preview.fileHash,
          JSON.stringify(preview),
        ],
      );
      return Response.json({
        previewId: id,
        companyId: ctx.companyId,
        counts: preview.counts,
        totals: preview.totals,
        errors: preview.errors,
        warnings: preview.warnings,
        sample: preview.records
          .filter((r) => r.table === "clients")
          .slice(0, 5)
          .map((r) => ({
            reference: r.values.reference,
            bride: r.values.bride,
            groom: r.values.groom,
          })),
      });
    }
    const body = await req.json();
    if (body.companyId !== ctx.companyId || body.confirmPrivate !== true)
      throw new HttpError(400, "Explicitly confirm this private workspace.");
    const r = await query(
      "SELECT payload FROM import_previews WHERE id=$1 AND company_id=$2 AND user_id=$3 AND expires_at>now()",
      [body.previewId, ctx.companyId, ctx.userId],
    );
    if (!r.rows[0]) throw new HttpError(404, "Preview expired. Upload again.");
    const summary = await commitPreview(ctx, r.rows[0].payload);
    await query("DELETE FROM import_previews WHERE id=$1 AND company_id=$2", [
      body.previewId,
      ctx.companyId,
    ]);
    return Response.json({
      message: "Import committed transactionally.",
      summary,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
