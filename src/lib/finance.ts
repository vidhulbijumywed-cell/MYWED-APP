import { dateOnly } from "./db";
export type Data = Record<string, any[]>;
export const num = (v: any) => Number(v || 0);
export const sum = (rows: any[], field = "amount") =>
  rows.reduce((total, row) => {
    const next = total + num(row[field]);
    if (!Number.isSafeInteger(next))
      throw new Error(
        "Aggregate amount exceeds supported integer-money range.",
      );
    return next;
  }, 0);
export function minor(value: any) {
  if (value === undefined || value === null || value === "") return null;
  const s = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(s))
    throw new Error(
      "Amounts must be non-negative with at most two decimal places.",
    );
  const [a, b = ""] = s.split(".");
  const n = Number(a) * 100 + Number(b.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n > 1e14)
    throw new Error("Amount too large.");
  return n;
}
export function chooseRate(
  rates: any[],
  crew: string,
  role: string,
  eventType: string,
) {
  const found =
    rates.find(
      (r) =>
        r.crew_id === crew && r.role === role && r.event_type === eventType,
    ) ??
    rates.find(
      (r) =>
        r.crew_id === crew &&
        r.role === role &&
        r.event_type === "All functions",
    );
  return found ? num(found.amount) : null;
}
export function crewBalance(assigned: number, completed: number, paid: number) {
  return {
    assigned,
    completed,
    paid,
    pending: Math.max(0, completed - paid),
    advance: Math.max(0, paid - completed),
  };
}
export function clientFinancial(c: any, d: Data) {
  const events = (d.events || []).filter((r) => r.client_id === c.id);
  const ids = new Set(events.map((r) => r.id));
  const as = (d.assignments || []).filter((r) => ids.has(r.event_id));
  const jobs = (d.jobs || []).filter((r) => r.client_id === c.id);
  const jobIds = new Set(jobs.map((r) => r.id));
  const payments = (d.client_payments || []).filter(
    (r) => r.client_id === c.id,
  );
  const quoted = num(c.package_amount) + num(c.addons) - num(c.discount);
  const contract =
    c.status === "Cancelled" ? num(c.cancellation_value) : quoted;
  const received = payments.reduce(
    (t, r) => t + (r.type === "Refund" ? -1 : 1) * num(r.amount),
    0,
  );
  const advance = sum(payments.filter((r) => r.type === "Advance"));
  const crewCost = sum(as);
  const jobCost = sum(jobs);
  const expense = sum((d.expenses || []).filter((r) => r.client_id === c.id));
  const cost = crewCost + jobCost + expense;
  const dates = events.map((r) => dateOnly(r.date)).sort();
  return {
    quoted,
    contract,
    advance,
    received,
    balance: contract - received,
    crewCost,
    crewPaid: sum((d.crew_payments || []).filter((r) => r.client_id === c.id)),
    jobCost,
    vendorPaid: sum(
      (d.vendor_payments || []).filter((r) => jobIds.has(r.job_id)),
    ),
    expense,
    cost,
    profit: contract - cost,
    margin: contract ? ((contract - cost) / contract) * 100 : 0,
    firstEvent: dates[0] || "",
    lastEvent: dates.at(-1) || "",
    eventCount: events.length,
    cohortDate: dates[0] || dateOnly(c.booking_date),
    missingRates: as.filter((r) => r.amount === null).length,
    paymentStatus:
      contract === 0
        ? "No amount set"
        : contract - received <= 0
          ? "Fully Paid"
          : received <= 0
            ? "Unpaid"
            : received === advance
              ? "Advance Paid"
              : "Part Paid",
  };
}
export function overdue(row: any, today: string, production = false) {
  const due = dateOnly(production ? row.due_date : row.promised_date);
  const done = production
    ? row.date_received || ["Received", "Approved"].includes(row.status)
    : row.delivered_date || row.status === "Delivered";
  return due && !done && due < today
    ? Math.round((Date.parse(today) - Date.parse(due)) / 86400000)
    : 0;
}
export function conflicts(events: any[], assignments: any[]) {
  const out: any[] = [];
  for (let i = 0; i < assignments.length; i++)
    for (let j = i + 1; j < assignments.length; j++) {
      const a = assignments[i],
        b = assignments[j];
      if (a.crew_id !== b.crew_id || a.event_id === b.event_id) continue;
      const x = events.find((r) => r.id === a.event_id),
        y = events.find((r) => r.id === b.event_id);
      if (!x || !y || dateOnly(x.date) !== dateOnly(y.date)) continue;
      const times = x.start_time && x.end_time && y.start_time && y.end_time;
      const overlap =
        times && x.start_time < y.end_time && y.start_time < x.end_time;
      if (!times || overlap)
        out.push({
          crew_id: a.crew_id,
          event_ids: [x.id, y.id],
          date: dateOnly(x.date),
          severity: overlap
            ? "Confirmed time overlap"
            : "Possible same-day conflict",
        });
    }
  return out;
}
export function fyRange(date: string, startMonth = 4) {
  const d = new Date(date + "T12:00:00Z");
  const y = d.getUTCFullYear() - (d.getUTCMonth() + 1 < startMonth ? 1 : 0);
  return {
    from: `${y}-${String(startMonth).padStart(2, "0")}-01`,
    to: new Date(Date.UTC(y + 1, startMonth - 1, 0)).toISOString().slice(0, 10),
  };
}
export function report(d: Data, from: string, to: string, today: string) {
  const inRange = (date: any) => dateOnly(date) >= from && dateOnly(date) <= to;
  const cs = (d.clients || []).map((c) => ({
    ...c,
    financial: clientFinancial(c, d),
  }));
  const cohort = cs.filter(
    (c) => c.financial.cohortDate && inRange(c.financial.cohortDate),
  );
  const allProfit = cohort.reduce((t, c) => t + c.financial.profit, 0);
  const overheads = sum(
    (d.expenses || []).filter((r) => !r.client_id && inRange(r.date)),
  );
  const incoming = (d.client_payments || []).filter((r) => inRange(r.date));
  const inflows = sum(incoming.filter((r) => r.type !== "Refund"));
  const refunds = sum(incoming.filter((r) => r.type === "Refund"));
  const crewOut = sum((d.crew_payments || []).filter((r) => inRange(r.date)));
  const vendorOut = sum(
    (d.vendor_payments || []).filter((r) => r.date && inRange(r.date)),
  );
  const expenseOut = sum((d.expenses || []).filter((r) => inRange(r.date)));
  const outflows = refunds + crewOut + vendorOut + expenseOut;
  const balances = (clientId?: string) =>
    (d.crew || []).map((c) => {
      const eventIds = new Set(
        (d.events || [])
          .filter((e) => !clientId || e.client_id === clientId)
          .map((e) => e.id),
      );
      const completedIds = new Set(
        (d.events || [])
          .filter(
            (e) =>
              e.status === "Completed" &&
              (!clientId || e.client_id === clientId),
          )
          .map((e) => e.id),
      );
      const assignments = (d.assignments || []).filter(
        (a) => a.crew_id === c.id && eventIds.has(a.event_id),
      );
      const paid = sum(
        (d.crew_payments || []).filter(
          (p) => p.crew_id === c.id && (!clientId || p.client_id === clientId),
        ),
      );
      return {
        ...c,
        client_id: clientId || null,
        ...crewBalance(
          sum(assignments.filter((a) => !completedIds.has(a.event_id))),
          sum(assignments.filter((a) => completedIds.has(a.event_id))),
          paid,
        ),
      };
    });
  const crew = balances();
  const crewPerClient = (d.clients || []).flatMap((c) =>
    balances(c.id).filter((b) => b.assigned || b.completed || b.paid),
  );
  const vendors = (d.vendors || []).map((v) => {
    const jobs = (d.jobs || []).filter((r) => r.vendor_id === v.id);
    const ids = new Set(jobs.map((r) => r.id));
    const agreed = sum(jobs),
      paid = sum((d.vendor_payments || []).filter((r) => ids.has(r.job_id)));
    return { ...v, jobs: jobs.length, agreed, paid, balance: agreed - paid };
  });
  const monthly: Record<string, any> = {};
  for (const c of cohort) {
    const month = c.financial.cohortDate.slice(0, 7);
    monthly[month] ??= { month, bookings: 0, revenue: 0, cost: 0, profit: 0 };
    monthly[month].bookings++;
    monthly[month].revenue += c.financial.contract;
    monthly[month].cost += c.financial.cost;
    monthly[month].profit += c.financial.profit;
  }
  const leadSources: Record<string, any> = {};
  for (const c of cohort) {
    const name = c.lead_source || "Unspecified";
    leadSources[name] ??= { name, bookings: 0, revenue: 0, profit: 0 };
    leadSources[name].bookings++;
    leadSources[name].revenue += c.financial.contract;
    leadSources[name].profit += c.financial.profit;
  }
  const categories: Record<string, number> = {};
  for (const e of (d.expenses || []).filter((r) => inRange(r.date)))
    categories[e.category] = (categories[e.category] || 0) + num(e.amount);
  return {
    from,
    to,
    cohort,
    clients: cs,
    crew,
    crewPerClient,
    vendors,
    monthly: Object.values(monthly).sort((a: any, b: any) =>
      a.month.localeCompare(b.month),
    ),
    leadSources: Object.values(leadSources),
    categories,
    weddings: cohort.filter((c) => c.status !== "Cancelled").length,
    cancellations: cohort.filter((c) => c.status === "Cancelled").length,
    contract: cohort.reduce((t, c) => t + c.financial.contract, 0),
    received: cohort.reduce((t, c) => t + c.financial.received, 0),
    balance: cohort.reduce((t, c) => t + c.financial.balance, 0),
    cost: cohort.reduce((t, c) => t + c.financial.cost, 0),
    grossProfit: allProfit,
    overheads,
    netProfit: allProfit - overheads,
    inflows,
    outflows,
    cashNet: inflows - outflows,
    crewPending: sum(crew, "pending"),
    vendorBalance: sum(vendors, "balance"),
    undatedVendorPayments: (d.vendor_payments || []).filter((r) => !r.date)
      .length,
    upcoming: (d.events || [])
      .filter((r) => dateOnly(r.date) >= today && r.status !== "Completed")
      .sort((a, b) => dateOnly(a.date).localeCompare(dateOnly(b.date)))
      .slice(0, 8),
    overdueClients: cs.filter(
      (c) =>
        c.balance_due_date &&
        dateOnly(c.balance_due_date) < today &&
        c.financial.balance > 0,
    ),
    overdueDeliverables: (d.deliverables || []).filter((r) =>
      overdue(r, today),
    ),
    overdueJobs: (d.jobs || []).filter((r) => overdue(r, today, true)),
  };
}
