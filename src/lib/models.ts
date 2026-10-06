export type Field = {
  key: string;
  label: string;
  kind?:
    | "text"
    | "date"
    | "time"
    | "money"
    | "number"
    | "select"
    | "textarea"
    | "email";
  required?: boolean;
  options?: string[];
  lookup?: string;
  settings?: string;
};
const f = (
  key: string,
  label: string,
  kind: Field["kind"] = "text",
  extra: Partial<Field> = {},
): Field => ({ key, label, kind, ...extra });
const client = f("client_id", "Client", "select", {
  lookup: "clients",
  required: true,
});
const money = f("amount", "Amount", "money", { required: true });
const notes = f("notes", "Notes", "textarea");
const status = (settings: string, options?: string[]) =>
  f("status", "Status", "select", { settings, options });
const payment = [
  f("date", "Payment date", "date", { required: true }),
  money,
  f("mode", "Payment mode", "select", { settings: "Payment Modes" }),
  f("reference", "Reference"),
  notes,
];
export const roles = [
  "Photographer",
  "Videographer",
  "Drone",
  "Live Streaming",
  "Social Media Creator",
  "Assistant",
];
export const models: Record<
  string,
  { title: string; fields: Field[]; financial?: boolean }
> = {
  clients: {
    title: "Clients",
    fields: [
      f("bride", "Bride name"),
      f("groom", "Groom name"),
      f("contact", "Primary contact"),
      f("phone", "Phone / WhatsApp"),
      f("alternate_phone", "Alternate phone"),
      f("email", "Email", "email"),
      f("address", "Address", "textarea"),
      f("lead_source", "Lead source", "select", { settings: "Lead Sources" }),
      f("booking_date", "Booking date", "date"),
      status("Client Status"),
      f("package_description", "Package description", "textarea"),
      f("package_amount", "Package amount", "money"),
      f("addons", "Add-ons", "money"),
      f("discount", "Discount", "money"),
      f("cancellation_value", "Agreed cancellation charge", "money"),
      f("balance_due_date", "Balance due by", "date"),
      notes,
    ],
  },
  events: {
    title: "Events",
    fields: [
      client,
      f("event_type", "Event type", "select", {
        settings: "Events",
        required: true,
      }),
      f("date", "Event date", "date", { required: true }),
      f("start_time", "Start time", "time"),
      f("end_time", "End time", "time"),
      f("venue", "Venue"),
      status("Event Work Status"),
      notes,
    ],
  },
  crew: {
    title: "Crew directory",
    fields: [
      f("name", "Name", "text", { required: true }),
      f("category", "Category", "select", { options: roles }),
      f("phone", "Phone"),
      f("payment_details", "Payment details"),
      f("city", "City / base"),
      notes,
    ],
  },
  rates: {
    title: "Crew rates",
    financial: true,
    fields: [
      f("crew_id", "Crew member", "select", { lookup: "crew", required: true }),
      f("role", "Role", "select", { options: roles, required: true }),
      f("event_type", "Event type", "select", {
        settings: "Events",
        options: ["All functions"],
        required: true,
      }),
      money,
      notes,
    ],
  },
  assignments: {
    title: "Crew assignments",
    fields: [
      f("event_id", "Event", "select", { lookup: "events", required: true }),
      f("crew_id", "Crew member", "select", { lookup: "crew", required: true }),
      f("role", "Role", "select", { options: roles, required: true }),
      f("amount", "Agreed rate override (blank = rate lookup)", "money"),
      f("override_reason", "Reason for rate override"),
    ],
  },
  client_payments: {
    title: "Client payments",
    financial: true,
    fields: [
      client,
      f("type", "Payment type", "select", {
        settings: "Client Payment Types",
        options: ["Refund"],
        required: true,
      }),
      ...payment,
    ],
  },
  crew_payments: {
    title: "Crew payments",
    financial: true,
    fields: [
      client,
      f("crew_id", "Crew member", "select", { lookup: "crew", required: true }),
      f("type", "Type", "select", { settings: "Crew Payment Types" }),
      ...payment,
    ],
  },
  vendors: {
    title: "Vendors",
    fields: [
      f("name", "Name / business", "text", { required: true }),
      f("type", "Vendor type", "select", { settings: "Vendor / Work Types" }),
      f("phone", "Phone"),
      f("email", "Email", "email"),
      f("payment_details", "Payment details"),
      f("address", "Address / city"),
      notes,
    ],
  },
  jobs: {
    title: "Post-production",
    fields: [
      client,
      f("vendor_id", "Vendor", "select", { lookup: "vendors", required: true }),
      f("work_type", "Work type", "select", {
        settings: "Vendor / Work Types",
        required: true,
      }),
      f("description", "Work description", "textarea"),
      f("quantity", "Quantity", "number"),
      money,
      f("date_sent", "Date sent", "date"),
      f("due_date", "Due date", "date"),
      f("date_received", "Date received", "date"),
      status("Work Status"),
      notes,
    ],
  },
  vendor_payments: {
    title: "Vendor payments",
    financial: true,
    fields: [
      f("job_id", "Production job", "select", {
        lookup: "jobs",
        required: true,
      }),
      f("type", "Type", "select", { options: ["Advance", "Final", "Other"] }),
      ...payment,
    ],
  },
  expenses: {
    title: "Expenses",
    financial: true,
    fields: [
      f("client_id", "Client / GENERAL overhead", "select", {
        lookup: "clients",
      }),
      f("date", "Date", "date", { required: true }),
      f("category", "Category", "select", {
        settings: "Expense Categories",
        required: true,
      }),
      f("description", "Description"),
      money,
      f("paid_by", "Paid by"),
      f("mode", "Payment mode", "select", { settings: "Payment Modes" }),
      f("reference", "Bill / reference"),
    ],
  },
  deliverables: {
    title: "Deliverables",
    fields: [
      client,
      f("type", "Deliverable", "select", {
        settings: "Deliverable Types",
        required: true,
      }),
      f("specifications", "Specifications", "textarea"),
      f("quantity", "Quantity", "number"),
      f("promised_date", "Promised date", "date"),
      f("delivered_date", "Delivered date", "date"),
      status("Deliverable Status"),
      notes,
    ],
  },
  albums: {
    title: "Albums",
    fields: [
      client,
      f("name", "Album name", "text", { required: true }),
      f("style", "Style", "select", { settings: "Album Styles" }),
      f("size", "Size"),
      f("pages", "Sheets / pages", "number"),
      f("material", "Cover / material"),
      f("copies", "Copies", "number"),
      f("designer_id", "Designer", "select", { lookup: "vendors" }),
      f("printer_id", "Printer", "select", { lookup: "vendors" }),
      f("designer_job_id", "Designer production job", "select", {
        lookup: "jobs",
      }),
      f("printer_job_id", "Printer production job", "select", {
        lookup: "jobs",
      }),
      f("selection_sent", "Selection sent", "date"),
      f("design_approved", "Design approved", "date"),
      f("print_sent", "Sent to print", "date"),
      f("delivered_date", "Delivered to client", "date"),
      status("Album Status"),
      notes,
    ],
  },
};
export const financialFields = new Set([
  "package_amount",
  "addons",
  "discount",
  "cancellation_value",
  "amount",
  "override_reason",
  "payment_details",
]);
