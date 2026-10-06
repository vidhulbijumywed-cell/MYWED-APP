import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { cookies } from "next/headers";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { query, transaction } from "./db";
import { createClient } from "@supabase/supabase-js";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function checkPassword(password: string, value: string) {
  const [s, h] = value.split(":");
  if (!s || !h) return false;
  const a = Buffer.from(h, "hex"),
    b = scryptSync(password, s, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function supabase() {
  return process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
}
export type Context = {
  userId: string;
  email: string;
  companyId: string;
  role: string;
};
export async function identity() {
  const t = (await cookies()).get("mywed_session")?.value;
  if (!t) throw new HttpError(401, "Please log in.");
  const { rows } = await query(
    "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [hash(t)],
  );
  if (!rows[0]) throw new HttpError(401, "Your session expired.");
  return rows[0];
}
export async function context(companyId?: string | null): Promise<Context> {
  const u = await identity();
  const id = companyId || (await cookies()).get("mywed_company")?.value;
  const { rows } = await query(
    "SELECT * FROM members WHERE user_id=$1 AND company_id=$2",
    [u.id, id || null],
  );
  if (!rows[0])
    throw new HttpError(403, "You are not a member of this company.");
  return {
    userId: u.id,
    email: u.email,
    companyId: rows[0].company_id,
    role: rows[0].role,
  };
}
export function finance(ctx: Context) {
  if (ctx.role === "Staff")
    throw new HttpError(
      403,
      "Financial access requires Owner, Manager, or Accountant.",
    );
}
export function owner(ctx: Context) {
  if (ctx.role !== "Owner")
    throw new HttpError(
      403,
      "Only the company owner can manage members and settings.",
    );
}
export async function session(userId: string) {
  const token = randomBytes(32).toString("hex");
  await query("INSERT INTO sessions VALUES($1,$2,now()+interval '7 days')", [
    hash(token),
    userId,
  ]);
  (await cookies()).set("mywed_session", token, {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.COOKIE_SECURE !== "false",
    sameSite: "lax",
    path: "/",
    maxAge: 604800,
  });
}
export function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const expected = new URL(req.url);
  const host = req.headers.get("host");
  if (host) expected.host = host;
  const allowed = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : expected.origin;
  if (origin && origin !== allowed)
    throw new HttpError(403, "Invalid request origin.");
  if (req.headers.get("sec-fetch-site") === "cross-site")
    throw new HttpError(403, "Cross-site request rejected.");
}
export async function sendMail(email: string, subject: string, body: string) {
  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: email,
        subject,
        text: body,
      }),
    });
    if (!res.ok)
      throw new HttpError(503, "Email delivery failed. Please retry later.");
  } else {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_LOCAL_MAIL !== "true"
    )
      throw new HttpError(
        503,
        "Configure email delivery before using account emails.",
      );
    const id = randomUUID();
    await query(
      "INSERT INTO mail_outbox(id,email,subject,body) VALUES($1,$2,$3,$4)",
      [id, email, subject, body],
    );
    const dir = path.join(process.cwd(), ".data/mail");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(
      path.join(dir, id + ".json"),
      JSON.stringify({
        email,
        subject,
        body,
        created_at: new Date().toISOString(),
      }),
      { mode: 0o600 },
    );
  }
}
export async function issueToken(
  userId: string | null,
  email: string,
  kind: string,
  companyId: string | null = null,
  role: string | null = null,
) {
  const token = randomBytes(32).toString("hex");
  await query(
    "INSERT INTO auth_tokens VALUES($1,$2,$3,$4,$5,$6,now()+interval '24 hours')",
    [hash(token), userId, companyId, email, kind, role],
  );
  const url = new URL(process.env.APP_URL || "http://localhost:3000");
  url.hash = new URLSearchParams({ token, action: kind }).toString();
  await sendMail(
    email,
    `MyWed ${kind}`,
    `Continue securely: ${url.toString()}\nThis link expires in 24 hours.`,
  );
}
export async function consumeToken(
  token: string,
  kind: string,
  fn: (row: any, q: typeof query) => Promise<any>,
) {
  return transaction(async (q) => {
    const { rows } = await q(
      "DELETE FROM auth_tokens WHERE token_hash=$1 AND kind=$2 AND expires_at>now() RETURNING *",
      [hash(token), kind],
    );
    if (!rows[0]) throw new HttpError(400, "Invalid or expired link.");
    return fn(rows[0], q);
  });
}
export function errorResponse(e: unknown) {
  if (e instanceof HttpError)
    return Response.json({ error: e.message }, { status: e.status });
  console.error(e instanceof Error ? e.message : "Unknown error");
  return Response.json(
    {
      error:
        "Unable to save. Check required fields, duplicate entries, and linked records.",
    },
    { status: 400 },
  );
}
// Per-process protection in local mode; deploy behind an edge rate limiter for distributed hosting.
const hits = new Map<string, { n: number; until: number }>();
export function rateLimit(req: Request, action = "login") {
  if (
    ![
      "signup",
      "login",
      "reset",
      "verify",
      "new-password",
      "supabase-callback",
      "supabase-password",
      "invite",
    ].includes(action)
  )
    return;
  const key =
    (req.headers.get("x-forwarded-for")?.split(",")[0] || "local") +
    ":" +
    action;
  const now = Date.now();
  const entry = hits.get(key);
  if (entry && entry.until > now) {
    if (++entry.n > 30)
      throw new HttpError(429, "Too many attempts. Try again in 10 minutes.");
  } else hits.set(key, { n: 1, until: now + 600000 });
}
