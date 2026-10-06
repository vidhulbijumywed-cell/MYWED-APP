import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Context, finance, HttpError } from "./auth";
import { models, financialFields } from "./models";
import { query, Query, normalize, transaction } from "./db";
import { chooseRate, minor, Data } from "./finance";
export async function loadData(ctx: Context, q: Query = query): Promise<Data> {
  const data: Data = {};
  for (const [table, m] of Object.entries(models)) {
    if (ctx.role === "Staff" && m.financial) {
      data[table] = [];
      continue;
    }
    const { rows } = await q(`SELECT * FROM ${table} WHERE company_id=$1`, [
      ctx.companyId,
    ]);
    data[table] = rows.map((r) => {
      const v = normalize(r);
      if (ctx.role === "Staff") for (const k of financialFields) delete v[k];
      return v;
    });
  }
  return data;
}
export async function audit(
  ctx: Context,
  table: string,
  id: string,
  action: string,
  before: any,
  after: any,
  q: Query,
) {
  await q(
    "INSERT INTO audit_log(id,company_id,user_id,entity,record_id,action,before_value,after_value) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      randomUUID(),
      ctx.companyId,
      ctx.userId,
      table,
      id,
      action,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
    ],
  );
}
export async function saveRecord(
  ctx: Context,
  table: string,
  input: any,
  id?: string,
  q?: Query,
  importing = false,
): Promise<any> {
  if (!q)
    return transaction((t) => saveRecord(ctx, table, input, id, t, importing));
  const model = models[table];
  if (!model) throw new HttpError(400, "Unknown module.");
  if (model.financial) finance(ctx);
  if (ctx.role === "Accountant" && !model.financial)
    throw new HttpError(
      403,
      "Accountants can edit payment records, expenses, and rates.",
    );
  if (ctx.role === "Staff" && ["clients", "crew", "vendors"].includes(table))
    throw new HttpError(403, "Managers manage clients and directories.");
  if (ctx.role === "Staff" && table === "jobs" && !id)
    throw new HttpError(
      403,
      "Managers create production jobs and agree costs; staff can update existing job progress.",
    );
  let before: any = null;
  if (id) {
    z.string().uuid().parse(id);
    const r = await q(
      `SELECT * FROM ${table} WHERE company_id=$1 AND id=$2 FOR UPDATE`,
      [ctx.companyId, id],
    );
    before = r.rows[0];
    if (!before)
      throw new HttpError(404, "Record not found in your workspace.");
  }
  const companyDefaults =
    (await q("SELECT defaults FROM companies WHERE id=$1", [ctx.companyId]))
      .rows[0]?.defaults || {};
  const values: Record<string, any> = {};
  for (const field of model.fields) {
    if (!(field.key in input)) {
      if (!id && field.required)
        throw new HttpError(400, `${field.label} is required.`);
      continue;
    }
    const raw = input[field.key];
    if (ctx.role === "Staff" && financialFields.has(field.key))
      throw new HttpError(403, "Staff cannot change financial fields.");
    if (
      field.required &&
      !(importing && table === "vendor_payments" && field.key === "date") &&
      (raw === null || raw === undefined || raw === "")
    )
      throw new HttpError(400, `${field.label} is required.`);
    if (field.kind === "money")
      values[field.key] = importing
        ? raw == null
          ? null
          : z.coerce.number().int().min(0).max(1e14).parse(raw)
        : minor(raw);
    else if (field.kind === "number")
      values[field.key] =
        raw === "" || raw == null
          ? null
          : z.coerce
              .number()
              .int()
              .min(field.key === "pages" ? 0 : 1)
              .max(100000)
              .parse(raw);
    else if (field.lookup) {
      values[field.key] = raw || null;
      if (raw) {
        z.string().uuid().parse(raw);
        const r = await q(
          `SELECT * FROM ${field.lookup} WHERE company_id=$1 AND id=$2`,
          [ctx.companyId, raw],
        );
        if (!r.rows.length)
          throw new HttpError(
            400,
            `${field.label} belongs to another workspace or no longer exists.`,
          );
      }
    } else if (field.kind === "date") {
      if (!raw) values[field.key] = null;
      else {
        z.string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .parse(raw);
        if (new Date(raw).toISOString().slice(0, 10) !== raw)
          throw new HttpError(400, "Invalid date.");
        values[field.key] = raw;
      }
    } else if (field.kind === "time") {
      if (raw)
        z.string()
          .regex(/^\d{2}:\d{2}(:\d{2})?$/)
          .parse(raw);
      values[field.key] = raw || null;
    } else {
      const v = raw == null ? "" : String(raw);
      z.string().max(10000).parse(v);
      if (field.kind === "email" && v) z.string().email().parse(v);
      if (field.kind === "select" && !field.lookup) {
        const options = [
          ...(field.options || []),
          ...(companyDefaults[field.settings || ""] || []),
        ];
        if (
          v &&
          options.length &&
          !options.includes(v) &&
          before?.[field.key] !== v
        )
          throw new HttpError(
            400,
            `${field.label} must use a configured option.`,
          );
      }
      values[field.key] = v;
    }
  }
  const effective = { ...before, ...values };
  if (table === "clients") {
    if (!effective.bride && !effective.groom)
      throw new HttpError(400, "Enter a bride or groom name.");
    if (
      (effective.discount || 0) >
      (effective.package_amount || 0) + (effective.addons || 0)
    )
      throw new HttpError(400, "Discount cannot exceed package and add-ons.");
    if (!id) {
      if (importing && input.reference) {
        z.string()
          .regex(/^MW-\d+$/)
          .parse(input.reference);
        values.reference = input.reference;
        await q(
          "UPDATE companies SET next_client=GREATEST(next_client,$1) WHERE id=$2",
          [Number(input.reference.slice(3)) + 1, ctx.companyId],
        );
      } else {
        const r = await q(
          "UPDATE companies SET next_client=next_client+1 WHERE id=$1 RETURNING next_client-1 AS seq",
          [ctx.companyId],
        );
        values.reference = `MW-${String(r.rows[0].seq).padStart(3, "0")}`;
      }
    }
  }
  if (
    table === "events" &&
    effective.start_time &&
    effective.end_time &&
    effective.end_time <= effective.start_time
  )
    throw new HttpError(
      400,
      "End time must follow start time. Split overnight work into separate events.",
    );
  if (table === "assignments") {
    const ev = (
      await q("SELECT * FROM events WHERE company_id=$1 AND id=$2", [
        ctx.companyId,
        effective.event_id,
      ])
    ).rows[0];
    if (!ev) throw new HttpError(400, "Event is required.");
    if (
      !id ||
      "amount" in values ||
      effective.crew_id !== before.crew_id ||
      effective.role !== before.role ||
      effective.event_id !== before.event_id
    ) {
      const explicit = values.amount !== null && values.amount !== undefined;
      if (explicit) {
        finance(ctx);
        if (
          (!before ||
            values.amount !== Number(before.amount) ||
            effective.crew_id !== before.crew_id ||
            effective.role !== before.role ||
            effective.event_id !== before.event_id) &&
          !effective.override_reason?.trim()
        )
          throw new HttpError(400, "Explain the agreed rate override.");
      } else {
        const rs = (
          await q("SELECT * FROM rates WHERE company_id=$1", [ctx.companyId])
        ).rows;
        values.amount = chooseRate(
          rs,
          effective.crew_id,
          effective.role,
          ev.event_type,
        );
        values.override_reason = "";
      }
    }
  }
  if (table === "crew_payments") {
    const rows = await q(
      "SELECT a.id FROM assignments a JOIN events e ON e.id=a.event_id AND e.company_id=a.company_id WHERE a.company_id=$1 AND a.crew_id=$2 AND e.client_id=$3",
      [ctx.companyId, effective.crew_id, effective.client_id],
    );
    if (!rows.rows.length)
      throw new HttpError(
        400,
        "Crew payments must link to an assignment for this client.",
      );
  }
  if (table === "albums") {
    for (const key of ["designer_job_id", "printer_job_id"])
      if (effective[key]) {
        const job = (
          await q("SELECT * FROM jobs WHERE company_id=$1 AND id=$2", [
            ctx.companyId,
            effective[key],
          ])
        ).rows[0];
        if (job.client_id !== effective.client_id)
          throw new HttpError(
            400,
            "Album production job must belong to the same client.",
          );
        const vendor =
          key === "designer_job_id"
            ? effective.designer_id
            : effective.printer_id;
        if (vendor && job.vendor_id !== vendor)
          throw new HttpError(400, "Album job vendor does not match.");
      }
  }
  // Staff may complete assignments, but rates are snapshotted by the server and omitted from responses.
  for (const k of Object.keys(values))
    if (
      values[k] === null &&
      !["amount", "pages", "client_id"].includes(k) &&
      !models[table].fields.find((f) => f.key === k)?.lookup &&
      !models[table].fields.find((f) => f.key === k)?.kind?.match(/date|time/)
    )
      delete values[k];
  const keys = Object.keys(values);
  const recordId = id || randomUUID();
  let saved: any;
  if (id) {
    if (!keys.length) {
      if (ctx.role === "Staff")
        for (const key of financialFields) delete before[key];
      return normalize(before);
    }
    saved = (
      await q(
        `UPDATE ${table} SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(",")} WHERE company_id=$${keys.length + 1} AND id=$${keys.length + 2} RETURNING *`,
        [...keys.map((k) => values[k]), ctx.companyId, id],
      )
    ).rows[0];
  } else {
    saved = (
      await q(
        `INSERT INTO ${table}(id,company_id,${keys.join(",")}) VALUES(${Array.from({ length: keys.length + 2 }, (_, i) => `$${i + 1}`).join(",")}) RETURNING *`,
        [recordId, ctx.companyId, ...keys.map((k) => values[k])],
      )
    ).rows[0];
  }
  await audit(ctx, table, recordId, id ? "update" : "create", before, saved, q);
  if (ctx.role === "Staff")
    for (const key of financialFields) delete saved[key];
  return normalize(saved);
}
export async function deleteRecord(ctx: Context, table: string, id: string) {
  if (!models[table]) throw new HttpError(400, "Unknown module.");
  if (!["Owner", "Manager"].includes(ctx.role))
    throw new HttpError(
      403,
      "Only owners and managers can archive or delete records.",
    );
  return transaction(async (q) => {
    const row = (
      await q(
        `SELECT * FROM ${table} WHERE company_id=$1 AND id=$2 FOR UPDATE`,
        [ctx.companyId, id],
      )
    ).rows[0];
    if (!row) throw new HttpError(404, "Record not found.");
    if (["clients", "crew", "vendors"].includes(table)) {
      await q(
        `UPDATE ${table} SET archived=NOT archived WHERE company_id=$1 AND id=$2`,
        [ctx.companyId, id],
      );
      await audit(ctx, table, id, "archive-toggle", row, null, q);
      return;
    }
    if (
      [
        "client_payments",
        "crew_payments",
        "vendor_payments",
        "expenses",
        "assignments",
        "jobs",
      ].includes(table)
    )
      throw new HttpError(
        400,
        "Financial history cannot be deleted. Correct the record with an audited edit, or record a client refund.",
      );
    await q(`DELETE FROM ${table} WHERE company_id=$1 AND id=$2`, [
      ctx.companyId,
      id,
    ]);
    await audit(ctx, table, id, "delete", row, null, q);
  });
}
