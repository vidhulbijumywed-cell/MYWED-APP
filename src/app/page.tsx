"use client";
import { useEffect, useState, FormEvent } from "react";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Camera,
  CreditCard,
  Clapperboard,
  Package,
  BookOpen,
  Store,
  Receipt,
  ChartNoAxesCombined,
  Settings,
  Plus,
  Search,
  ArrowUpRight,
  Heart,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  LogOut,
  Check,
  AlertTriangle,
  Flower2,
  LoaderCircle,
} from "lucide-react";
import { models, financialFields, Field } from "@/lib/models";
type Any = Record<string, any>;
const nav = [
  ["Dashboard", LayoutDashboard],
  ["Clients", Users],
  ["Calendar", CalendarDays],
  ["Crew", Camera],
  ["Payments", CreditCard],
  ["Production", Clapperboard],
  ["Deliverables", Package],
  ["Albums", BookOpen],
  ["Vendors", Store],
  ["Expenses", Receipt],
  ["Reports", ChartNoAxesCombined],
  ["Settings", Settings],
] as const;
const groups: Record<string, string[]> = {
  Clients: ["clients", "events", "assignments"],
  Crew: ["crew", "rates", "assignments"],
  Payments: ["client_payments", "crew_payments", "vendor_payments"],
  Production: ["jobs", "vendor_payments"],
  Deliverables: ["deliverables"],
  Albums: ["albums"],
  Vendors: ["vendors"],
  Expenses: ["expenses"],
};
async function api(url: string, body?: any, method = "POST") {
  const r = await fetch(
    url,
    body
      ? {
          method,
          headers:
            body instanceof FormData
              ? undefined
              : { "Content-Type": "application/json" },
          body: body instanceof FormData ? body : JSON.stringify(body),
        }
      : undefined,
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
export default function App() {
  const [account, setAccount] = useState<Any | null>(null),
    [payload, setPayload] = useState<Any | null>(null),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState("Dashboard"),
    [tab, setTab] = useState("clients"),
    [mobile, setMobile] = useState(false),
    [toast, setToast] = useState<{ message: string; error?: boolean } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<{
      table: string;
      record?: Any;
      defaults?: Any;
    } | null>(null),
    [detail, setDetail] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [clientFilter, setClientFilter] = useState(""),
    [crewFilter, setCrewFilter] = useState(""),
    [eventFilter, setEventFilter] = useState(""),
    [sort, setSort] = useState(""),
    [asc, setAsc] = useState(true),
    [pg, setPg] = useState(1),
    [range, setRange] = useState({ from: "", to: "" }),
    [preview, setPreview] = useState<Any | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [authMode, setAuthMode] = useState("login"),
    [token, setToken] = useState(""),
    [invite, setInvite] = useState(""),
    [sbTokens, setSbTokens] = useState<Any | null>(null),
    [calendarMode, setCalendarMode] = useState("month"),
    [calendarDate, setCalendarDate] = useState(
      new Date().toISOString().slice(0, 10),
    );
  const notify = (message: string, error = false) => {
    setToast({ message, error });
  };
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 7000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  async function refresh() {
    try {
      const a = await api("/api/auth");
      setAccount(a);
      if (
        a.companies.length &&
        a.activeCompany &&
        a.companies.some((c: Any) => c.id === a.activeCompany)
      ) {
        const d = await api(
          "/api/data" +
            (range.from && range.to
              ? `?from=${range.from}&to=${range.to}`
              : ""),
        );
        setPayload(d);
      } else setPayload(null);
    } catch (e) {
      setAccount(null);
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const handleLinks = () => {
      const u = new URL(window.location.href);
      const localFragment = new URLSearchParams(u.hash.slice(1));
      const t = localFragment.get("token") || u.searchParams.get("token"),
        action = localFragment.get("action") || u.searchParams.get("action");
      if (t) {
        setToken(t);
        if (action === "verify")
          api("/api/auth", { action: "verify", token: t })
            .then((d) => notify(d.message))
            .catch((e) => notify(e.message, true));
        if (action === "reset") setAuthMode("new-password");
        if (action === "invite") setInvite(t);
      }
      const hash = new URLSearchParams(window.location.hash.slice(1));
      if (hash.get("access_token")) {
        const ts = {
          access_token: hash.get("access_token"),
          refresh_token: hash.get("refresh_token"),
        };
        if (hash.get("type") === "recovery") {
          setSbTokens(ts);
          setAuthMode("new-password");
        } else
          api("/api/auth", { action: "supabase-callback", ...ts })
            .then(() => refresh())
            .catch((e) => notify(e.message, true));
      }
      window.history.replaceState({}, "", window.location.pathname);
      refresh();
    };
    handleLinks();
    window.addEventListener("hashchange", handleLinks);
    return () => window.removeEventListener("hashchange", handleLinks);
  }, []);
  useEffect(() => {
    if (account?.activeCompany) refresh();
  }, [range.from, range.to]);
  async function run(fn: () => Promise<any>) {
    setBusy(true);
    try {
      const d = await fn();
      if (d?.message) notify(d.message);
      return d;
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Unable to complete request",
        true,
      );
      return null;
    } finally {
      setBusy(false);
    }
  }
  const auth = async (body: Any) =>
    run(async () => {
      const d = await api("/api/auth", body);
      await refresh();
      return d;
    });
  const company = payload?.company,
    role = payload?.role,
    data = payload?.data || {},
    reports = payload?.reports,
    financial = role !== "Staff";
  const money = (n: any) => {
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: company?.currency || "INR",
        maximumFractionDigits: 0,
      }).format(Number(n || 0) / 100);
    } catch {
      return (Number(n || 0) / 100).toFixed(2);
    }
  };
  const clientName = (id: string) => {
    const c = data.clients?.find((r: Any) => r.id === id);
    return c
      ? `${c.bride}${c.bride && c.groom ? " & " : ""}${c.groom}`
      : "GENERAL";
  };
  const label = (table: string, id: string) => {
    const r = data[table]?.find((v: Any) => v.id === id);
    return !r
      ? "—"
      : table === "clients"
        ? `${r.reference} · ${clientName(r.id)}`
        : table === "events"
          ? `${r.event_type} · ${clientName(r.client_id)} · ${r.date}`
          : table === "jobs"
            ? `${r.work_type} · ${clientName(r.client_id)}`
            : r.name;
  };
  const lookup = (f: Field) =>
    data[f.lookup || ""]?.filter((r: Any) => !r.archived) || [];
  const canWrite = (table: string) =>
    role === "Owner" ||
    role === "Manager" ||
    (role === "Accountant" && models[table].financial) ||
    (role === "Staff" &&
      !models[table].financial &&
      !["clients", "crew", "vendors"].includes(table));
  const canCreate = (table: string) =>
    canWrite(table) && !(role === "Staff" && table === "jobs");
  const open = (table: string, record?: Any, defaults?: Any) => {
    setModal({ table, record, defaults });
  };
  function navigate(name: string) {
    setPage(name);
    setTab(
      groups[name]?.find((t) => !models[t].financial || financial) || "clients",
    );
    setDetail(null);
    setQuery("");
    setStatusFilter("");
    setClientFilter("");
    setPg(1);
    setMobile(false);
  }
  const badge = (s: string) => (
    <span
      className={`badge ${s === "Cancelled" || s === "Overdue" ? "danger" : ["Not Started", "Assigned", "Unpaid", "Selection Pending"].includes(s) ? "warning" : ""}`}
    >
      {s}
    </span>
  );
  const empty = (title: string, text: string, table?: string) => (
    <div className="empty">
      <Flower2 size={28} />
      <h3>{title}</h3>
      <p className="muted">{text}</p>
      {table && canCreate(table) && (
        <button className="btn primary" onClick={() => open(table)}>
          <Plus size={14} /> Add {models[table].title.toLowerCase()}
        </button>
      )}
    </div>
  );
  const stat = (title: string, value: any, note: string, highlight = false) => (
    <div className={`stat ${highlight ? "highlight" : ""}`}>
      <div className="label">
        {title}
        <ArrowUpRight size={15} />
      </div>
      <div className="value">{value}</div>
      <small>{note}</small>
    </div>
  );
  const change = (current: number, prev: number) =>
    prev === 0
      ? "No comparable prior value"
      : `${(((current - prev) / Math.abs(prev)) * 100).toFixed(1)}% vs previous period`;
  function heading(
    title: string,
    description: string,
    actions?: React.ReactNode,
  ) {
    return (
      <div className="heading">
        <div>
          <div className="eyebrow">YOUR WEDDING BUSINESS, IN FOCUS</div>
          <h1>{title}</h1>
          <div className="muted">{description}</div>
        </div>
        <div className="actions">{actions}</div>
      </div>
    );
  }
  const dateFilters = (
    <div className="datefilters">
      <span>Report period</span>
      <input
        aria-label="Report start date"
        type="date"
        value={range.from || reports?.from || ""}
        onChange={(e) =>
          setRange({ from: e.target.value, to: range.to || reports?.to })
        }
      />
      <span>—</span>
      <input
        aria-label="Report end date"
        type="date"
        value={range.to || reports?.to || ""}
        onChange={(e) =>
          setRange({ from: range.from || reports?.from, to: e.target.value })
        }
      />
    </div>
  );
  async function saveForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal) return;
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const table = modal.table;
    const d = await run(() =>
      api("/api/data", { table, id: modal.record?.id, values }),
    );
    if (d) {
      setModal(null);
      await refresh();
    }
  }
  function field(f: Field, record: Any) {
    const initial = record[f.key];
    const value =
      f.kind === "money" && initial !== undefined && initial !== null
        ? (Number(initial) / 100).toFixed(2)
        : (initial ?? (f.kind === "number" && f.key !== "pages" ? 1 : ""));
    const options = [
      ...new Set([
        ...(f.options || []),
        ...(initial && !f.lookup ? [String(initial)] : []),
        ...(company?.defaults[f.settings || ""] || []),
      ]),
    ];
    return (
      <label
        className={`field ${f.kind === "textarea" ? "wide" : ""}`}
        key={f.key}
      >
        {f.label}
        {f.required ? " *" : ""}
        {f.kind === "textarea" ? (
          <textarea name={f.key} defaultValue={value} />
        ) : f.kind === "select" ? (
          <select
            name={f.key}
            required={f.required}
            defaultValue={value || options[0] || ""}
          >
            {(f.lookup || !f.required) && (
              <option value="">
                {f.key === "client_id" && modal?.table === "expenses"
                  ? "GENERAL overhead"
                  : "Select…"}
              </option>
            )}
            {f.lookup
              ? lookup(f).map((r: Any) => (
                  <option key={r.id} value={r.id}>
                    {label(f.lookup!, r.id)}
                  </option>
                ))
              : options.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
          </select>
        ) : (
          <input
            name={f.key}
            type={
              f.kind === "money" || f.kind === "number"
                ? "number"
                : f.kind === "date"
                  ? "date"
                  : f.kind === "time"
                    ? "time"
                    : f.kind === "email"
                      ? "email"
                      : "text"
            }
            step={
              f.kind === "money"
                ? "0.01"
                : f.kind === "number"
                  ? "1"
                  : undefined
            }
            min={
              f.kind === "money" || f.key === "pages"
                ? 0
                : f.kind === "number"
                  ? 1
                  : undefined
            }
            defaultValue={value}
            required={f.required}
          />
        )}
      </label>
    );
  }
  function recordTable(table: string, rows?: Any[], compact = false) {
    const model = models[table];
    if (!model) return null;
    let rs = [...(rows || data[table] || [])];
    if (!compact) {
      rs = rs.filter(
        (r) =>
          JSON.stringify(r).toLowerCase().includes(query.toLowerCase()) &&
          (!statusFilter || r.status === statusFilter) &&
          (!clientFilter || r.client_id === clientFilter),
      );
      if (sort)
        rs.sort(
          (a, b) =>
            String(a[sort] ?? "").localeCompare(
              String(b[sort] ?? ""),
              undefined,
              { numeric: true },
            ) * (asc ? 1 : -1),
        );
    }
    const fields = model.fields
      .filter(
        (f) =>
          !["notes", "textarea"].includes(f.key) &&
          f.kind !== "textarea" &&
          (financial || !financialFields.has(f.key)),
      )
      .slice(0, table === "clients" ? 4 : 6);
    const statusField = model.fields.find((f) => f.key === "status");
    if (statusField && !fields.some((f) => f.key === "status"))
      fields.push(statusField);
    const count = rs.length,
      shown = compact ? rs : rs.slice((pg - 1) * 12, pg * 12);
    return (
      <div className="panel">
        {shown.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  {table === "clients" && <th>REFERENCE</th>}
                  {fields.map((f) => (
                    <th key={f.key}>
                      <button
                        onClick={() => {
                          setAsc(sort === f.key ? !asc : true);
                          setSort(f.key);
                        }}
                      >
                        {f.label.toUpperCase()}{" "}
                        {sort === f.key ? (asc ? "↑" : "↓") : ""}
                      </button>
                    </th>
                  ))}
                  {table === "clients" && financial && (
                    <>
                      <th>CONTRACT</th>
                      <th>BALANCE</th>
                    </>
                  )}
                  {table === "events" && (
                    <>
                      <th>CREW / TEAM</th>
                      {financial && <th>AGREED COST</th>}
                    </>
                  )}
                  {(table === "deliverables" || table === "jobs") && (
                    <th>DUE</th>
                  )}
                  {table === "jobs" && financial && (
                    <>
                      <th>PAID</th>
                      <th>BALANCE</th>
                    </>
                  )}
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    {table === "clients" && (
                      <td>
                        <button
                          className="name"
                          onClick={() => {
                            setDetail(r.id);
                            setPage("Clients");
                          }}
                        >
                          {r.reference}
                        </button>
                        {r.archived && <div className="sub">Archived</div>}
                      </td>
                    )}
                    {fields.map((f) => (
                      <td key={f.key}>
                        {f.lookup ? (
                          label(f.lookup, r[f.key])
                        ) : f.kind === "money" ? (
                          r[f.key] === null ? (
                            <span className="badge danger">Missing rate</span>
                          ) : (
                            money(r[f.key])
                          )
                        ) : f.key === "status" ? (
                          badge(r[f.key])
                        ) : (
                          String(r[f.key] ?? "—").slice(0, 75)
                        )}
                      </td>
                    ))}
                    {table === "clients" && financial && (
                      <>
                        <td>
                          {money(
                            reports?.clients.find((c: Any) => c.id === r.id)
                              ?.financial.contract,
                          )}
                        </td>
                        <td>
                          {money(
                            reports?.clients.find((c: Any) => c.id === r.id)
                              ?.financial.balance,
                          )}
                        </td>
                      </>
                    )}
                    {table === "events" && (
                      <>
                        <td>
                          {r.crew_count || 0} ·{" "}
                          {(r.team || [])
                            .map((a: Any) => `${a.name} (${a.role})`)
                            .join(", ") || "Unassigned"}
                        </td>
                        {financial && (
                          <td>
                            {money(r.agreed_cost)}
                            {r.missing_rates > 0 && (
                              <span className="badge danger">
                                Missing rates
                              </span>
                            )}
                          </td>
                        )}
                      </>
                    )}
                    {(table === "deliverables" || table === "jobs") && (
                      <td>
                        {r.overdue_days > 0
                          ? badge(`Overdue · ${r.overdue_days} days`)
                          : (table === "deliverables"
                              ? r.promised_date
                              : r.due_date) || "—"}
                      </td>
                    )}
                    {table === "jobs" &&
                      financial &&
                      (() => {
                        const paid = (data.vendor_payments || [])
                          .filter((p: Any) => p.job_id === r.id)
                          .reduce(
                            (n: number, p: Any) => n + Number(p.amount),
                            0,
                          );
                        return (
                          <>
                            <td>{money(paid)}</td>
                            <td>{money(Number(r.amount) - paid)}</td>
                          </>
                        );
                      })()}
                    <td>
                      <div className="actions">
                        {table === "clients" && (
                          <button
                            className="btn"
                            onClick={() => setDetail(r.id)}
                          >
                            Open
                          </button>
                        )}
                        {canWrite(table) && (
                          <button
                            className="btn"
                            onClick={() => open(table, r)}
                          >
                            Edit
                          </button>
                        )}
                        {["Owner", "Manager"].includes(role) &&
                          ["clients", "crew", "vendors"].includes(table) && (
                            <button
                              className="btn"
                              onClick={() =>
                                run(async () => {
                                  const d = await api(
                                    "/api/data",
                                    { table, id: r.id },
                                    "DELETE",
                                  );
                                  await refresh();
                                  return d;
                                })
                              }
                            >
                              {r.archived ? "Restore" : "Archive"}
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          empty(
            "A fresh start",
            "Your records will appear here as you add them.",
            table,
          )
        )}
        {!compact && (
          <div className="pagination">
            <span>
              {count} record{count !== 1 ? "s" : ""} · Page {pg} of{" "}
              {Math.max(1, Math.ceil(count / 12))}
            </span>
            <div className="actions">
              <button
                className="btn"
                disabled={pg === 1}
                onClick={() => setPg(pg - 1)}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                className="btn"
                disabled={pg * 12 >= count}
                onClick={() => setPg(pg + 1)}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
  function dashboard() {
    return (
      <>
        {heading(
          "A little clarity. A lot of possibilities.",
          `Welcome to ${company.name}. Here’s how your business is looking.`,
          <button
            className="btn primary"
            disabled={!canWrite("clients")}
            onClick={() => open("clients")}
          >
            <Plus size={15} /> New booking
          </button>,
        )}
        {financial && dateFilters}
        {financial && reports ? (
          <>
            <div className="stats">
              {stat(
                "BOOKED WEDDINGS",
                reports.weddings,
                change(reports.weddings, reports.previous.weddings),
              )}
              {stat(
                "COHORT CONTRACT VALUE",
                money(reports.contract),
                change(reports.contract, reports.previous.contract),
              )}
              {stat(
                "BALANCE TO COLLECT",
                money(reports.balance),
                "Lifetime payments for selected wedding cohort",
              )}
              {stat(
                "EXPECTED NET PROFIT",
                money(reports.netProfit),
                change(reports.netProfit, reports.previous.netProfit),
                true,
              )}
            </div>
            <div className="grid2">
              <div className="panel">
                <div className="panelhead">
                  <h2>Your business, month by month</h2>
                  <span className="muted">Wedding cohort</span>
                </div>
                <div className="panelbody">
                  {reports.monthly.length ? (
                    <>
                      <div className="chart">
                        {reports.monthly.map((m: Any) => {
                          const max = Math.max(
                            1,
                            ...reports.monthly.map((r: Any) => r.revenue),
                          );
                          return (
                            <div className="barcol" key={m.month}>
                              <div className="bars">
                                <div
                                  className="bar"
                                  title={`Contract ${money(m.revenue)}`}
                                  style={{
                                    height: Math.max(
                                      3,
                                      (m.revenue / max) * 150,
                                    ),
                                  }}
                                />
                                <div
                                  className="bar gold"
                                  title={`Cost ${money(m.cost)}`}
                                  style={{
                                    height: Math.max(3, (m.cost / max) * 150),
                                  }}
                                />
                              </div>
                              <small>
                                {new Date(m.month + "-01").toLocaleDateString(
                                  "en",
                                  { month: "short" },
                                )}
                              </small>
                            </div>
                          );
                        })}
                      </div>
                      <div className="legend">
                        <span>
                          <i className="dot" />
                          Contract value
                        </span>
                        <span>
                          <i className="dot gold" />
                          Agreed costs
                        </span>
                      </div>
                    </>
                  ) : (
                    empty(
                      "Your story starts with a booking",
                      "Add your first client to see monthly performance.",
                    )
                  )}
                </div>
              </div>
              <div className="panel">
                <div className="panelhead">
                  <h2>Cash in focus</h2>
                  <span className="badge">Transaction dates</span>
                </div>
                <div className="panelbody">
                  <div
                    className="kv"
                    style={{ padding: 0, gridTemplateColumns: "1fr 1fr" }}
                  >
                    <div>
                      <small>CASH RECEIVED</small>
                      <strong>{money(reports.inflows)}</strong>
                    </div>
                    <div>
                      <small>CASH PAID OUT</small>
                      <strong>{money(reports.outflows)}</strong>
                    </div>
                    <div>
                      <small>NET CASH MOVEMENT</small>
                      <strong>{money(reports.cashNet)}</strong>
                    </div>
                    <div>
                      <small>GENERAL OVERHEADS</small>
                      <strong>{money(reports.overheads)}</strong>
                    </div>
                    <div>
                      <small>CREW PENDING NOW · ALL TIME</small>
                      <strong>{money(reports.crewPending)}</strong>
                    </div>
                    <div>
                      <small>VENDOR BALANCE · ALL TIME</small>
                      <strong>{money(reports.vendorBalance)}</strong>
                    </div>
                  </div>
                  <p className="muted" style={{ marginTop: 25 }}>
                    Expected profit uses agreed costs. Cash movement uses actual
                    dated transactions, including refunds.
                  </p>
                  {reports.undatedVendorPayments > 0 && (
                    <div className="notice">
                      {reports.undatedVendorPayments} imported vendor payments
                      need dates before they appear in cash reports.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="notice">
            Your Staff workspace shows operational work. Financial records are
            restricted.
          </div>
        )}
        <div className="grid2">
          <div className="panel">
            <div className="panelhead">
              <h2>Coming up next</h2>
              <button className="muted" onClick={() => navigate("Calendar")}>
                View calendar ↗
              </button>
            </div>
            <div className="panelbody">
              {(
                reports?.upcoming ||
                data.events.filter((e: Any) => e.date >= payload!.today)
              ).length
                ? (
                    reports?.upcoming ||
                    data.events.filter((e: Any) => e.date >= payload!.today)
                  ).map((e: Any) => (
                    <div className="eventitem" key={e.id}>
                      <div className="datebox">
                        <small>
                          {new Date(e.date)
                            .toLocaleDateString("en", { month: "short" })
                            .toUpperCase()}
                        </small>
                        <strong>{e.date.slice(8, 10)}</strong>
                      </div>
                      <div className="grow">
                        <div className="name">{clientName(e.client_id)}</div>
                        <div className="sub">
                          {e.event_type} · {e.venue || "Venue to be added"}
                        </div>
                      </div>
                      {badge(e.status)}
                    </div>
                  ))
                : empty(
                    "Room for beautiful moments",
                    "Upcoming shoots will appear here.",
                    "events",
                  )}
            </div>
          </div>
          <div className="panel">
            <div className="panelhead">
              <h2>Needs your attention</h2>
              <AlertTriangle size={16} color="#c3964b" />
            </div>
            <div className="panelbody">
              {[
                [
                  "Overdue deliverables",
                  reports?.overdueDeliverables?.length ||
                    data.deliverables.filter((r: Any) => r.overdue_days > 0)
                      .length,
                  "Deliverables",
                ],
                [
                  "Overdue production jobs",
                  reports?.overdueJobs?.length ||
                    data.jobs.filter((r: Any) => r.overdue_days > 0).length,
                  "Production",
                ],
                [
                  "Overdue client balances",
                  reports?.overdueClients?.length || 0,
                  "Clients",
                ],
                [
                  "Crew scheduling conflicts",
                  payload!.conflicts.length,
                  "Crew",
                ],
              ].map(([name, count, dest]) => (
                <button
                  key={String(name)}
                  className="eventitem"
                  style={{ width: "100%", textAlign: "left" }}
                  onClick={() => navigate(String(dest))}
                >
                  <span className="grow">{name}</span>
                  <span
                    className={`badge ${Number(count) > 0 ? "warning" : ""}`}
                  >
                    {count}
                  </span>
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
          </div>
        </div>
        <h2 className="sectiontitle">A few things you can do next</h2>
        <div className="quick">
          {[
            ["Add a client", "clients", Heart],
            ["Schedule a shoot", "events", Camera],
            ["Record a payment", "client_payments", CreditCard],
            ["Track a deliverable", "deliverables", Package],
          ]
            .filter(([, t]) => canWrite(String(t)))
            .map(([name, t, Icon]: any) => (
              <button key={t} onClick={() => open(t)}>
                <Icon size={19} />
                {name}
                <Plus size={14} />
              </button>
            ))}
        </div>
        <p className="muted" style={{ marginTop: 25 }}>
          Wedding-cohort reports use first event date, falling back to booking
          date. Cash uses transaction dates. All-time obligations remain
          separate.
        </p>
      </>
    );
  }
  function clientDetail() {
    const c = data.clients.find((r: Any) => r.id === detail);
    if (!c) return null;
    const f = reports?.clients.find((r: Any) => r.id === detail)?.financial;
    const events = data.events.filter((r: Any) => r.client_id === detail),
      ids = new Set(events.map((r: Any) => r.id)),
      jobs = data.jobs.filter((r: Any) => r.client_id === detail),
      jids = new Set(jobs.map((r: Any) => r.id));
    return (
      <>
        {heading(
          "Every detail, together.",
          c.reference,
          <>
            <button className="btn" onClick={() => setDetail(null)}>
              ← All clients
            </button>
            {financial && (
              <>
                <a className="btn" href={`/api/pdf?client=${detail}`}>
                  <Download size={14} /> Client PDF
                </a>
                <a
                  className="btn"
                  href={`/api/pdf?client=${detail}&internal=true`}
                >
                  Internal PDF
                </a>
                <button className="btn" onClick={() => window.print()}>
                  Print internal
                </button>
              </>
            )}
            {canWrite("clients") && (
              <button
                className="btn primary"
                onClick={() => open("clients", c)}
              >
                Edit booking
              </button>
            )}
          </>,
        )}
        <div className="panel">
          <div className="detailhero">
            <div className="coupleicon">
              <Heart size={24} />
            </div>
            <div>
              <h2>{clientName(c.id)}</h2>
              <div className="muted">
                {c.contact} · {c.phone} · {c.email}
              </div>
            </div>
            {badge(c.status)}
          </div>
          <div className="kv">
            <div>
              <small>PACKAGE</small>
              {c.package_description || "No package description"}
            </div>
            <div>
              <small>BOOKED ON</small>
              {c.booking_date || "—"}
            </div>
            <div>
              <small>LEAD SOURCE</small>
              {c.lead_source || "—"}
            </div>
            <div>
              <small>ADDRESS</small>
              {c.address || "—"}
            </div>
            <div>
              <small>FIRST / LAST EVENT</small>
              {f?.firstEvent || events[0]?.date || "—"} / {f?.lastEvent || "—"}
            </div>
            <div>
              <small>NOTES</small>
              {c.notes || "—"}
            </div>
          </div>
        </div>
        {financial && f && (
          <>
            <div className="stats">
              {stat("CONTRACT", money(f.contract), f.paymentStatus)}
              {stat(
                "RECEIVED",
                money(f.received),
                `Advance ${money(f.advance)}`,
              )}
              {stat(
                "BALANCE DUE",
                money(f.balance),
                `Due ${c.balance_due_date || "not set"}`,
              )}
              {stat(
                "EXPECTED PROFIT",
                money(f.profit),
                `${f.margin.toFixed(1)}% margin`,
                true,
              )}
            </div>
            {f.missingRates > 0 && (
              <div className="notice">
                {f.missingRates} assignments have missing rates. Cost and profit
                figures are incomplete.
              </div>
            )}
            <div className="panel kv">
              <div>
                <small>AGREED CREW COST</small>
                {money(f.crewCost)}
              </div>
              <div>
                <small>AGREED PRODUCTION COST</small>
                {money(f.jobCost)}
              </div>
              <div>
                <small>WEDDING EXPENSES</small>
                {money(f.expense)}
              </div>
            </div>
          </>
        )}
        {[
          "events",
          "assignments",
          "client_payments",
          "crew_payments",
          "jobs",
          "vendor_payments",
          "deliverables",
          "albums",
          "expenses",
        ]
          .filter((t) => financial || !models[t].financial)
          .map((t) => {
            const rs =
              t === "assignments"
                ? data[t].filter((r: Any) => ids.has(r.event_id))
                : t === "vendor_payments"
                  ? data[t].filter((r: Any) => jids.has(r.job_id))
                  : data[t].filter((r: Any) => r.client_id === detail);
            return (
              <section key={t}>
                <div
                  className="heading"
                  style={{ marginTop: 27, marginBottom: 12 }}
                >
                  <h2 style={{ fontSize: 17 }}>{models[t].title}</h2>
                  {canCreate(t) && (
                    <button
                      className="btn"
                      onClick={() => open(t, undefined, { client_id: detail })}
                    >
                      <Plus size={14} /> Add
                    </button>
                  )}
                </div>
                {recordTable(t, rs, true)}
              </section>
            );
          })}
      </>
    );
  }
  function modulePage() {
    if (page === "Clients" && detail) return clientDetail();
    const tabs = (groups[page] || []).filter(
      (t) => financial || !models[t].financial,
    );
    const current = tabs.includes(tab) ? tab : tabs[0];
    if (!current)
      return empty(
        "Financial access restricted",
        "Ask your owner for the appropriate role.",
      );
    return (
      <>
        {heading(
          page,
          (
            {
              Clients: "Every couple, every commitment, beautifully organised.",
              Crew: "The right people for every moment.",
              Payments: "Clear ledgers. Confident decisions.",
              Production: "From raw footage to something unforgettable.",
              Deliverables: "Keep every promise on track.",
              Albums: "Stories made to be held.",
              Vendors: "Your trusted creative partners.",
              Expenses: "Know where every rupee goes.",
            } as Any
          )[page],
          <>
            {financial && (
              <a
                className="btn"
                href={`/api/export?table=${current}&format=xlsx`}
              >
                <Download size={14} /> Export
              </a>
            )}
            {canCreate(current) && (
              <button className="btn primary" onClick={() => open(current)}>
                <Plus size={14} /> Add {models[current].title.toLowerCase()}
              </button>
            )}
          </>,
        )}
        {tabs.length > 1 && (
          <div className="tabs">
            {tabs.map((t) => (
              <button
                key={t}
                className={`tab ${current === t ? "active" : ""}`}
                onClick={() => {
                  setTab(t);
                  setPg(1);
                  setQuery("");
                  setSort("");
                }}
              >
                {models[t].title}
              </button>
            ))}
          </div>
        )}
        <div className="toolbar">
          <div className="search">
            <Search size={15} />
            <input
              aria-label="Search records"
              placeholder={`Search ${models[current].title.toLowerCase()}…`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPg(1);
              }}
            />
          </div>
          {models[current].fields.some((f) => f.key === "status") && (
            <select
              aria-label="Status filter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPg(1);
              }}
            >
              <option value="">All statuses</option>
              {[
                ...new Set<string>(
                  (data[current] || []).map((r: Any) => r.status),
                ),
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          )}
          {models[current].fields.some((f) => f.key === "client_id") && (
            <select
              aria-label="Client filter"
              value={clientFilter}
              onChange={(e) => {
                setClientFilter(e.target.value);
                setPg(1);
              }}
            >
              <option value="">All clients</option>
              {data.clients.map((c: Any) => (
                <option value={c.id} key={c.id}>
                  {clientName(c.id)}
                </option>
              ))}
            </select>
          )}
        </div>
        {current === "assignments" && payload!.conflicts.length > 0 && (
          <div className="notice">
            {payload!.conflicts.map((c: Any, i: number) => (
              <div key={i}>
                {label("crew", c.crew_id)}: {c.severity} · {c.date}
              </div>
            ))}
          </div>
        )}
        {recordTable(current)}
        {page === "Crew" && financial && (
          <>
            <h2 className="sectiontitle">Payment position · all time</h2>
            <div className="toolbar">
              <select
                aria-label="Crew balance client"
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
              >
                <option value="">Company-wide balances</option>
                {data.clients.map((c: Any) => (
                  <option key={c.id} value={c.id}>
                    {clientName(c.id)}
                  </option>
                ))}
              </select>
            </div>
            <div className="panel tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>CREW</th>
                    <th>ASSIGNED, NOT DONE</th>
                    <th>COMPLETED</th>
                    <th>PAID</th>
                    <th>PENDING NOW</th>
                    <th>ADVANCE AHEAD</th>
                  </tr>
                </thead>
                <tbody>
                  {(clientFilter
                    ? reports.crewPerClient.filter(
                        (c: Any) => c.client_id === clientFilter,
                      )
                    : reports.crew
                  ).map((c: Any) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      {[
                        "assigned",
                        "completed",
                        "paid",
                        "pending",
                        "advance",
                      ].map((k) => (
                        <td key={k}>{money(c[k])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {page === "Vendors" && financial && (
          <>
            <h2 className="sectiontitle">Vendor balances · all time</h2>
            <div className="panel tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>VENDOR</th>
                    <th>JOBS</th>
                    <th>AGREED</th>
                    <th>PAID</th>
                    <th>BALANCE</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.vendors.map((v: Any) => (
                    <tr key={v.id}>
                      <td>{v.name}</td>
                      <td>{v.jobs}</td>
                      {["agreed", "paid", "balance"].map((k) => (
                        <td key={k}>{money(v[k])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </>
    );
  }
  function calendar() {
    const dt = new Date(calendarDate + "T12:00:00Z"),
      month = dt.getUTCMonth(),
      year = dt.getUTCFullYear();
    const filtered = data.events.filter(
      (e: Any) =>
        (!clientFilter || e.client_id === clientFilter) &&
        (!statusFilter || e.status === statusFilter) &&
        (!eventFilter || e.event_type === eventFilter) &&
        (!crewFilter ||
          data.assignments.some(
            (a: Any) => a.event_id === e.id && a.crew_id === crewFilter,
          )),
    );
    const monday = new Date(dt);
    monday.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
    const first = new Date(Date.UTC(year, month, 1)),
      start =
        calendarMode === "week"
          ? monday
          : new Date(
              first.getTime() - ((first.getUTCDay() + 6) % 7) * 86400000,
            ),
      days = Array.from({ length: calendarMode === "week" ? 7 : 42 }, (_, i) =>
        new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10),
      );
    const move = (direction: number) => {
      if (calendarMode === "week")
        dt.setUTCDate(dt.getUTCDate() + 7 * direction);
      else dt.setUTCMonth(dt.getUTCMonth() + direction, 1);
      setCalendarDate(dt.toISOString().slice(0, 10));
    };
    return (
      <>
        {heading(
          "A calendar full of moments.",
          "Plan shoots, see the team, and spot scheduling conflicts.",
          canWrite("events") && (
            <button className="btn primary" onClick={() => open("events")}>
              <Plus size={14} /> Schedule event
            </button>
          ),
        )}
        <div className="toolbar">
          <div className="actions">
            <button className="btn" onClick={() => move(-1)}>
              <ChevronLeft size={15} />
            </button>
            <strong>
              {dt.toLocaleDateString("en", { month: "long", year: "numeric" })}
            </strong>
            <button className="btn" onClick={() => move(1)}>
              <ChevronRight size={15} />
            </button>
            <input
              type="date"
              aria-label="Calendar date"
              value={calendarDate}
              onChange={(e) => setCalendarDate(e.target.value)}
            />
          </div>
          {["month", "week", "agenda"].map((m) => (
            <button
              key={m}
              className={`btn ${calendarMode === m ? "primary" : ""}`}
              onClick={() => setCalendarMode(m)}
            >
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <div className="toolbar">
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            aria-label="Calendar client"
          >
            <option value="">All clients</option>
            {data.clients.map((c: Any) => (
              <option key={c.id} value={c.id}>
                {clientName(c.id)}
              </option>
            ))}
          </select>
          <select
            value={crewFilter}
            onChange={(e) => setCrewFilter(e.target.value)}
            aria-label="Calendar crew"
          >
            <option value="">All crew</option>
            {data.crew.map((c: Any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            aria-label="Calendar event type"
          >
            <option value="">All event types</option>
            {company.defaults.Events.map((c: string) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Calendar status"
          >
            <option value="">All statuses</option>
            {company.defaults["Event Work Status"].map((s: string) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        {calendarMode === "agenda" ? (
          <div className="panel panelbody">
            {filtered
              .filter((e: Any) => e.date >= calendarDate)
              .sort((a: Any, b: Any) => a.date.localeCompare(b.date))
              .map((e: Any) => (
                <div className="eventitem" key={e.id}>
                  <div className="datebox">{e.date}</div>
                  <div className="grow">
                    <strong>
                      {clientName(e.client_id)} · {e.event_type}
                    </strong>
                    <div className="sub">
                      {e.start_time || "Time TBC"} · {e.venue} ·{" "}
                      {data.assignments
                        .filter((a: Any) => a.event_id === e.id)
                        .map((a: Any) => label("crew", a.crew_id))
                        .join(", ")}
                    </div>
                  </div>
                  <button
                    className="btn"
                    disabled={!canWrite("events")}
                    onClick={() => open("events", e)}
                  >
                    Details
                  </button>
                </div>
              ))}
            {!filtered.length &&
              empty(
                "Nothing scheduled yet",
                "Add an event to start planning.",
                "events",
              )}
          </div>
        ) : (
          <div className="panel">
            <div className="calendar">
              {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
                <div className="calday" key={d}>
                  {d}
                </div>
              ))}
              {days.map((d) => (
                <div
                  key={d}
                  className={`calcell ${Number(d.slice(5, 7)) - 1 !== month ? "outside" : ""}`}
                >
                  <span>{Number(d.slice(8))}</span>
                  {filtered
                    .filter((e: Any) => e.date === d)
                    .map((e: Any) => (
                      <button
                        className="calevent"
                        key={e.id}
                        onClick={() =>
                          canWrite("events")
                            ? open("events", e)
                            : (setDetail(e.client_id), setPage("Clients"))
                        }
                      >
                        {e.start_time?.slice(0, 5)} {e.event_type}
                        <br />
                        {clientName(e.client_id)}
                        <br />
                        {data.assignments
                          .filter((a: Any) => a.event_id === e.id)
                          .map((a: Any) => label("crew", a.crew_id))
                          .join(", ")}
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }
  function reportsPage() {
    if (!financial)
      return empty(
        "Financial access restricted",
        "Ask your company owner for report access.",
      );
    const r = reports;
    return (
      <>
        {heading(
          "Understand the bigger picture.",
          "Consistent dates, transparent calculations, and actionable numbers.",
          <>
            <a
              className="btn"
              href={`/api/export?table=reports&from=${r.from}&to=${r.to}`}
            >
              <Download size={14} /> XLSX report
            </a>
            <a
              className="btn"
              href={`/api/export?table=reports&format=csv&from=${r.from}&to=${r.to}`}
            >
              CSV cohort
            </a>
          </>,
        )}
        {dateFilters}
        <div className="notice">
          Wedding cohort: first event date, otherwise booking date. Cash:
          transaction dates. Cancelled bookings keep agreed cancellation
          charges, refunds, and incurred costs. Money exports use integer minor
          units.
        </div>
        <div className="stats">
          {stat(
            "AVERAGE ACTIVE BOOKING",
            money(
              r.cohort
                .filter((c: Any) => c.status !== "Cancelled")
                .reduce((n: number, c: Any) => n + c.financial.contract, 0) /
                Math.max(1, r.weddings),
            ),
            `${r.weddings} active · ${r.cancellations} cancelled`,
          )}
          {stat(
            "AGREED WEDDING COSTS",
            money(r.cost),
            "Crew + production + wedding expenses",
          )}
          {stat(
            "EXPECTED GROSS PROFIT",
            money(r.grossProfit),
            "Contract less agreed wedding costs",
          )}
          {stat(
            "EXPECTED NET PROFIT",
            money(r.netProfit),
            "Gross profit less period overheads",
            true,
          )}
        </div>
        <h2 className="sectiontitle">Monthly wedding cohorts</h2>
        <div className="panel tablewrap">
          <table>
            <thead>
              <tr>
                <th>MONTH</th>
                <th>BOOKINGS</th>
                <th>CONTRACT</th>
                <th>COST</th>
                <th>PROFIT</th>
              </tr>
            </thead>
            <tbody>
              {r.monthly.map((m: Any) => (
                <tr key={m.month}>
                  <td>{m.month}</td>
                  <td>{m.bookings}</td>
                  {["revenue", "cost", "profit"].map((k) => (
                    <td key={k}>{money(m[k])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid2">
          <div className="panel">
            <div className="panelhead">
              <h2>Lead-source performance · cohort</h2>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>SOURCE</th>
                    <th>BOOKINGS</th>
                    <th>CONTRACT</th>
                    <th>PROFIT</th>
                  </tr>
                </thead>
                <tbody>
                  {r.leadSources.map((l: Any) => (
                    <tr key={l.name}>
                      <td>{l.name}</td>
                      <td>{l.bookings}</td>
                      <td>{money(l.revenue)}</td>
                      <td>{money(l.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel">
            <div className="panelhead">
              <h2>Expenses · transaction dates</h2>
            </div>
            <div className="panelbody">
              {Object.entries(r.categories).map(([k, v]) => (
                <div className="eventitem" key={k}>
                  <span className="grow">{k}</span>
                  <strong>{money(v)}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="stats">
          {stat("CASH INFLOWS", money(r.inflows), "Dated client receipts")}
          {stat(
            "CASH OUTFLOWS",
            money(r.outflows),
            "Crew, vendors, expenses, refunds",
          )}
          {stat(
            "NET MOVEMENT",
            money(r.cashNet),
            change(r.cashNet, r.previous.cashNet),
          )}
          {stat(
            "GENERAL OVERHEADS",
            money(r.overheads),
            "Separate from wedding costs",
          )}
        </div>
        {r.undatedVendorPayments > 0 && (
          <div className="notice">
            {r.undatedVendorPayments} vendor payments lack historical
            transaction dates. They count toward vendor balances but are
            excluded from dated cash reports.
          </div>
        )}
      </>
    );
  }
  async function settingsSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    const defaults: Any = {};
    for (const k of Object.keys(company.defaults))
      defaults[k] = String(form["default:" + k] || "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    await run(async () => {
      const d = await api("/api/data", { ...form, defaults }, "PATCH");
      await refresh();
      return d;
    });
  }
  function settings() {
    return (
      <>
        {heading(
          "Make MyWed your own.",
          "Workspace preferences, team access, and private spreadsheet imports.",
        )}
        {role === "Owner" ? (
          <>
            <form onSubmit={settingsSave}>
              <div className="panel panelbody">
                <h2 className="sectiontitle" style={{ marginTop: 0 }}>
                  Company workspace
                </h2>
                <div className="formgrid">
                  {[
                    ["name", "Business name"],
                    ["contact", "Contact details"],
                    ["logo", "Logo URL (HTTPS)"],
                    ["currency", "Currency code"],
                    ["timezone", "Timezone"],
                    ["fy_start", "Financial year start month (1–12)"],
                  ].map(([k, l]) => (
                    <label className="field" key={k}>
                      {l}
                      <input
                        name={k}
                        defaultValue={company[k]}
                        required={[
                          "name",
                          "currency",
                          "timezone",
                          "fy_start",
                        ].includes(k)}
                      />
                    </label>
                  ))}
                </div>
                <h2 className="sectiontitle">Your lists and statuses</h2>
                <p className="muted">
                  One option per line. Existing records keep their values when
                  lists change.
                </p>
                <div className="settingslist">
                  {Object.entries(company.defaults).map(([k, v]) => (
                    <label className="field" key={k}>
                      {k}
                      <textarea
                        name={"default:" + k}
                        defaultValue={(v as string[]).join("\n")}
                      />
                    </label>
                  ))}
                </div>
                <div className="formfooter">
                  <button className="btn primary" disabled={busy}>
                    Save settings
                  </button>
                </div>
              </div>
            </form>
            <h2 className="sectiontitle">Your team</h2>
            <div className="panel panelbody">
              <form
                className="toolbar"
                onSubmit={(e) => {
                  e.preventDefault();
                  auth({
                    action: "invite",
                    ...Object.fromEntries(new FormData(e.currentTarget)),
                  });
                }}
              >
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="colleague@studio.com"
                  aria-label="Invitation email"
                />
                <select name="role">
                  <option>Staff</option>
                  <option>Manager</option>
                  <option>Accountant</option>
                </select>
                <button className="btn primary" disabled={busy}>
                  Send invitation
                </button>
              </form>
              {payload!.members.map((m: Any) => (
                <div className="eventitem" key={m.user_id}>
                  <span className="grow">{m.email}</span>
                  {m.role === "Owner" ? (
                    badge("Owner")
                  ) : (
                    <>
                      <select
                        value={m.role}
                        onChange={(e) =>
                          auth({
                            action: "member-role",
                            user_id: m.user_id,
                            role: e.target.value,
                          })
                        }
                      >
                        <option>Manager</option>
                        <option>Accountant</option>
                        <option>Staff</option>
                      </select>
                      <button
                        className="btn danger"
                        onClick={() =>
                          auth({ action: "remove-member", user_id: m.user_id })
                        }
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              ))}
              <p className="muted">
                Managers manage operations and finances. Accountants edit
                ledgers, expenses, and rates. Staff manage shoots and delivery
                without financial access.
              </p>
            </div>
          </>
        ) : (
          <div className="notice">
            Only your company owner can change settings and members.
          </div>
        )}
        {["Owner", "Manager"].includes(role) && (
          <>
            <h2 className="sectiontitle">Import your wedding tracker</h2>
            <div className="panel panelbody">
              <p className="muted">
                Your workbook is private business data. Preview it first;
                records are committed only to <strong>{company.name}</strong>.
                No real records are used in demo data.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const result = await run(() =>
                    api("/api/import", new FormData(e.currentTarget)),
                  );
                  if (result) {
                    setPreview(result);
                    setConfirmed(false);
                  }
                }}
              >
                <div className="toolbar">
                  <input name="file" type="file" accept=".xlsx" required />
                  <button className="btn primary" disabled={busy}>
                    <Upload size={14} /> Preview import
                  </button>
                </div>
              </form>
              {preview && (
                <div>
                  <h3>Preview and reconciliation</h3>
                  <div className="kv">
                    {Object.entries(preview.counts).map(([k, v]) => (
                      <div key={k}>
                        <small>{models[k]?.title || k}</small>
                        {String(v)}
                      </div>
                    ))}
                  </div>
                  <div className="kv">
                    {Object.entries(preview.totals).map(([k, v]) => (
                      <div key={k}>
                        <small>{k}</small>
                        {money(v)}
                      </div>
                    ))}
                  </div>
                  {preview.sample?.map((r: Any) => (
                    <p key={r.reference}>
                      {r.reference}: {r.bride} & {r.groom}
                    </p>
                  ))}
                  {preview.errors.map((err: string, i: number) => (
                    <div className="notice error" key={i}>
                      {err}
                    </div>
                  ))}
                  {preview.warnings.map((warn: string, i: number) => (
                    <div className="notice" key={i}>
                      {warn}
                    </div>
                  ))}
                  <label style={{ display: "flex", gap: 10, margin: "20px 0" }}>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />{" "}
                    Import these real records into my private workspace:{" "}
                    {company.name}
                  </label>
                  <button
                    className="btn primary"
                    disabled={!confirmed || preview.errors.length > 0 || busy}
                    onClick={() =>
                      run(async () => {
                        const d = await api("/api/import", {
                          previewId: preview.previewId,
                          companyId: company.id,
                          confirmPrivate: true,
                        });
                        setPreview(null);
                        await refresh();
                        return d;
                      })
                    }
                  >
                    Commit import
                  </button>
                </div>
              )}
            </div>
          </>
        )}
        {role === "Owner" && (
          <>
            <h2 className="sectiontitle">Audit history</h2>
            <div className="panel tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>TIME</th>
                    <th>MODULE</th>
                    <th>ACTION</th>
                    <th>RECORD</th>
                  </tr>
                </thead>
                <tbody>
                  {payload!.auditLog.map((a: Any, i: number) => (
                    <tr key={i}>
                      <td>{a.created_at}</td>
                      <td>{a.entity}</td>
                      <td>{a.action}</td>
                      <td>{a.record_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="actions" style={{ marginTop: 25 }}>
          <button
            className="btn"
            onClick={() => {
              setPayload(null);
              setAccount({ ...account, activeCompany: null });
            }}
          >
            Create another company
          </button>
          <button className="btn" onClick={() => auth({ action: "logout" })}>
            <LogOut size={14} /> Log out
          </button>
        </div>
      </>
    );
  }
  function authScreen() {
    return (
      <div className="authshell">
        <div className="authstory">
          <div className="brand">
            <Flower2 size={31} />
            My<em>Wed</em>
          </div>
          <div className="eyebrow">
            BUILT FOR THE BUSINESS BEHIND THE BEAUTY
          </div>
          <h1>
            Beautiful moments.
            <br />
            Better managed.
          </h1>
          <p>
            From the first enquiry to the final frame. One thoughtful workspace
            for your clients, crew, payments, and everything in between.
          </p>
          <div className="muted" style={{ color: "#b4c7b4", marginTop: 50 }}>
            YOUR WORK. YOUR TEAM. YOUR STORY.
          </div>
        </div>
        <div className="authform">
          <div className="box">
            <div className="eyebrow">WELCOME TO MYWED</div>
            <h2>
              {authMode === "signup"
                ? "Start your next chapter."
                : authMode === "reset"
                  ? "Find your way back."
                  : authMode === "new-password"
                    ? "A fresh start."
                    : "Good to have you back."}
            </h2>
            <div className="muted">
              {authMode === "signup"
                ? "Create an account, then your own private company workspace."
                : authMode.includes("password")
                  ? "Choose a new password with at least 10 characters."
                  : authMode === "reset"
                    ? "We’ll email you a secure reset link."
                    : "Log in to your wedding business workspace."}
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const values = Object.fromEntries(
                  new FormData(e.currentTarget),
                );
                const action =
                  authMode === "new-password" && sbTokens
                    ? "supabase-password"
                    : authMode;
                const r = await auth({ action, ...values, token, ...sbTokens });
                if (r && authMode !== "login") setAuthMode("login");
              }}
            >
              {authMode !== "new-password" && (
                <label className="field">
                  Email address
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@yourstudio.com"
                  />
                </label>
              )}
              {authMode !== "reset" && (
                <label className="field">
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      authMode === "login" ? "current-password" : "new-password"
                    }
                    minLength={authMode === "login" ? 1 : 10}
                    required
                  />
                </label>
              )}
              <button className="btn primary" disabled={busy}>
                {busy ? <LoaderCircle size={16} /> : null}
                {authMode === "signup"
                  ? "Create account"
                  : authMode === "reset"
                    ? "Send reset link"
                    : authMode === "new-password"
                      ? "Update password"
                      : "Log in"}
                <ArrowUpRight size={15} />
              </button>
            </form>
            <div className="authlinks">
              <button
                onClick={() =>
                  setAuthMode(authMode === "login" ? "signup" : "login")
                }
              >
                {authMode === "login" ? "Create an account" : "Back to log in"}
              </button>
              {authMode === "login" && (
                <button onClick={() => setAuthMode("reset")}>
                  Forgot password?
                </button>
              )}
            </div>
            <p className="muted" style={{ marginTop: 40 }}>
              A calm place to keep a busy business moving.
            </p>
          </div>
        </div>
      </div>
    );
  }
  function onboarding() {
    return (
      <div className="panel onboarding">
        <div className="brand">
          <Flower2 size={28} />
          My<em>Wed</em>
        </div>
        <h1 className="sectiontitle">Your studio. Your workspace.</h1>
        <p className="muted">
          Start with an empty workspace. Your clients and financial records stay
          separate from every other company.
        </p>
        {invite && (
          <button
            className="btn primary"
            onClick={() =>
              auth({ action: "accept-invite", token: invite }).then((r) => {
                if (r) setInvite("");
              })
            }
          >
            Accept team invitation
          </button>
        )}
        {account?.companies.length > 0 && (
          <div className="toolbar">
            <select
              onChange={(e) =>
                auth({ action: "switch-company", company_id: e.target.value })
              }
              defaultValue=""
            >
              <option value="" disabled>
                Choose an existing workspace
              </option>
              {account!.companies.map((c: Any) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.role}
                </option>
              ))}
            </select>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            auth({
              action: "create-company",
              ...Object.fromEntries(new FormData(e.currentTarget)),
            });
          }}
        >
          <div className="formgrid">
            {[
              ["name", "Business name", ""],
              ["contact", "Email, phone, address", ""],
              ["logo", "Logo URL (HTTPS)", ""],
              ["currency", "Currency code", "INR"],
              ["timezone", "Timezone", "Asia/Kolkata"],
              ["fy_start", "Financial year starts in month", "4"],
            ].map(([k, l, v]) => (
              <label className="field" key={k}>
                {l}
                <input
                  name={k}
                  defaultValue={v}
                  required={[
                    "name",
                    "currency",
                    "timezone",
                    "fy_start",
                  ].includes(k)}
                />
              </label>
            ))}
          </div>
          <div className="formfooter">
            <button
              className="btn"
              type="button"
              onClick={() => auth({ action: "logout" })}
            >
              Log out
            </button>
            <button className="btn primary" disabled={busy}>
              Create workspace <ArrowUpRight size={14} />
            </button>
          </div>
        </form>
      </div>
    );
  }
  return (
    <>
      {loading ? (
        <div className="loading">
          <LoaderCircle className="animate-spin" size={25} />
        </div>
      ) : !account ? (
        authScreen()
      ) : !payload ? (
        onboarding()
      ) : (
        <div className="app">
          <aside className={`sidebar ${mobile ? "open" : ""}`}>
            <div className="brand">
              <Flower2 size={27} />
              My<em>Wed</em>
            </div>
            <div className="navlabel">WORKSPACE</div>
            {nav
              .filter(
                ([name]) =>
                  financial ||
                  !["Payments", "Expenses", "Reports"].includes(name),
              )
              .map(([name, Icon]) => (
                <button
                  className={`nav ${page === name ? "active" : ""}`}
                  key={name}
                  onClick={() => navigate(name)}
                >
                  <Icon />
                  {name}
                </button>
              ))}
            <div className="sidebottom">
              <div className="workspacebox">
                {company.logo && (
                  <img
                    src={company.logo}
                    alt={`${company.name} logo`}
                    style={{
                      width: 32,
                      height: 32,
                      objectFit: "contain",
                      display: "block",
                      marginBottom: 8,
                    }}
                  />
                )}
                <strong>{company.name}</strong>
                <small>
                  {role} workspace · {company.currency}
                </small>
              </div>
              <button
                className="nav"
                style={{ marginTop: 12 }}
                onClick={() => auth({ action: "logout" })}
              >
                <LogOut />
                Log out
              </button>
            </div>
          </aside>
          <main className="main">
            <header className="topbar">
              <button
                className="mobilemenu"
                aria-label="Open menu"
                onClick={() => setMobile(!mobile)}
              >
                <Menu size={21} />
              </button>
              <div className="crumb">
                Workspace <span style={{ margin: "0 10px" }}> / </span>
                <strong style={{ color: "#456049" }}>{page}</strong>
              </div>
              <div className="topright">
                <span className="muted">
                  {new Date().toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: company.timezone,
                  })}
                </span>
                <select
                  aria-label="Company workspace"
                  value={company.id}
                  onChange={(e) => {
                    setRange({ from: "", to: "" });
                    setPreview(null);
                    setDetail(null);
                    auth({
                      action: "switch-company",
                      company_id: e.target.value,
                    });
                  }}
                >
                  {account!.companies.map((c: Any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="avatar" title={account!.user.email}>
                  {account!.user.email.slice(0, 2).toUpperCase()}
                </div>
              </div>
            </header>
            <div className="content">
              {invite && (
                <div className="notice">
                  <button
                    className="btn"
                    onClick={() =>
                      auth({ action: "accept-invite", token: invite }).then(
                        (r) => {
                          if (r) setInvite("");
                        },
                      )
                    }
                  >
                    Accept pending team invitation
                  </button>
                </div>
              )}
              {financial &&
                data.assignments.some((a: Any) => a.amount === null) && (
                  <div className="notice">
                    Some assignments have no agreed rate. Cost, profit, and
                    obligation totals are incomplete until those rates are
                    resolved.
                  </div>
                )}
              {page === "Dashboard"
                ? dashboard()
                : page === "Calendar"
                  ? calendar()
                  : page === "Reports"
                    ? reportsPage()
                    : page === "Settings"
                      ? settings()
                      : modulePage()}
            </div>
          </main>
        </div>
      )}
      {modal && (
        <div className="modalback">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={models[modal.table].title}
          >
            <div className="modalhead">
              <h2>
                {modal.record ? "Edit" : "Add"}{" "}
                {models[modal.table].title.toLowerCase()}
              </h2>
              <button aria-label="Close" onClick={() => setModal(null)}>
                <X size={20} />
              </button>
            </div>
            {modal.table === "assignments" && (
              <div className="notice">
                The agreed rate is saved on this assignment. Blank uses the
                specific event rate, then “All functions”. A zero rate is valid.
                Missing rates are flagged.
              </div>
            )}
            <form onSubmit={saveForm}>
              <div className="formgrid">
                {models[modal.table].fields
                  .filter((f) => financial || !financialFields.has(f.key))
                  .map((f) => field(f, modal.record || modal.defaults || {}))}
              </div>
              <div className="formfooter">
                <button
                  className="btn"
                  type="button"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button className="btn primary" disabled={busy}>
                  {busy ? "Saving…" : "Save record"}
                  <Check size={14} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {toast && (
        <div role="status" className={`toast ${toast.error ? "error" : ""}`}>
          {toast.message}
        </div>
      )}
    </>
  );
}
