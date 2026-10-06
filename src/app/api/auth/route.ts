import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import defaults from "../../../../docs/workbook-defaults.json";
import { query, transaction } from "@/lib/db";
import {
  checkOrigin,
  checkPassword,
  consumeToken,
  context,
  errorResponse,
  hash,
  HttpError,
  identity,
  issueToken,
  owner,
  passwordHash,
  rateLimit,
  session,
  supabase,
} from "@/lib/auth";
export const runtime = "nodejs";
export async function GET() {
  try {
    const user = await identity();
    const { rows } = await query(
      "SELECT c.*,m.role FROM companies c JOIN members m ON m.company_id=c.id WHERE m.user_id=$1 ORDER BY c.created_at",
      [user.id],
    );
    return Response.json({
      user: { id: user.id, email: user.email },
      companies: rows,
      activeCompany: (await cookies()).get("mywed_company")?.value,
      managedAuth: !!supabase(),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const b = await req.json();
    const action = b.action;
    rateLimit(req, action);
    if (["signup", "login", "reset"].includes(action))
      z.string().email().max(254).parse(b.email);
    if (["signup", "login", "new-password"].includes(action))
      z.string()
        .min(action === "login" ? 1 : 10)
        .max(128)
        .parse(b.password);
    const email = String(b.email || "")
      .trim()
      .toLowerCase();
    const sb = supabase();
    if (action === "signup") {
      if (sb) {
        const r = await sb.auth.signUp({
          email,
          password: b.password,
          options: { emailRedirectTo: process.env.APP_URL },
        });
        if (r.error) throw new HttpError(400, r.error.message);
        return Response.json({
          message: "Check your email to verify your account.",
        });
      }
      const id = randomUUID();
      await query(
        "INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)",
        [id, email, passwordHash(b.password)],
      );
      await issueToken(id, email, "verify");
      return Response.json({
        message:
          "Verification sent. In local development, read the private mail outbox using npm run mail.",
      });
    }
    if (action === "login") {
      let u: any;
      if (sb) {
        const r = await sb.auth.signInWithPassword({
          email,
          password: b.password,
        });
        if (r.error || !r.data.user?.email_confirmed_at)
          throw new HttpError(
            401,
            "Invalid credentials or email not verified.",
          );
        u = r.data.user;
        await query(
          "INSERT INTO users(id,email,verified) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET email=excluded.email,verified=true",
          [u.id, email],
        );
      } else {
        const { rows } = await query("SELECT * FROM users WHERE email=$1", [
          email,
        ]);
        u = rows[0];
        if (!u?.password_hash || !checkPassword(b.password, u.password_hash))
          throw new HttpError(401, "Invalid email or password.");
        if (!u.verified)
          throw new HttpError(403, "Verify your email before logging in.");
      }
      await session(u.id);
      return Response.json({ message: "Welcome back." });
    }
    if (action === "supabase-callback") {
      if (!sb)
        throw new HttpError(400, "Managed authentication is not configured.");
      const r = await sb.auth.getUser(String(b.access_token));
      const u = r.data.user;
      if (r.error || !u?.email_confirmed_at)
        throw new HttpError(401, "Invalid verification session.");
      await query(
        "INSERT INTO users(id,email,verified) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET verified=true",
        [u.id, u.email],
      );
      await session(u.id);
      return Response.json({ message: "Email verified." });
    }
    if (action === "supabase-password") {
      if (!sb)
        throw new HttpError(400, "Managed authentication is not configured.");
      z.string().min(10).max(128).parse(b.password);
      const setResult = await sb.auth.setSession({
        access_token: b.access_token,
        refresh_token: b.refresh_token,
      });
      if (setResult.error)
        throw new HttpError(401, "Invalid recovery session.");
      const r = await sb.auth.updateUser({ password: b.password });
      if (r.error) throw new HttpError(400, r.error.message);
      if (r.data.user)
        await query("DELETE FROM sessions WHERE user_id=$1", [r.data.user.id]);
      return Response.json({ message: "Password updated. Please log in." });
    }
    if (action === "verify") {
      await consumeToken(b.token, "verify", async (t, q) =>
        q("UPDATE users SET verified=true WHERE id=$1", [t.user_id]),
      );
      return Response.json({ message: "Email verified. You can log in now." });
    }
    if (action === "reset") {
      if (sb) {
        const r = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: process.env.APP_URL,
        });
        if (r.error) throw new HttpError(400, r.error.message);
      } else {
        const { rows } = await query("SELECT id FROM users WHERE email=$1", [
          email,
        ]);
        if (rows[0]) await issueToken(rows[0].id, email, "reset");
      }
      return Response.json({
        message: "If the account exists, a reset link has been sent.",
      });
    }
    if (action === "new-password") {
      if (sb)
        throw new HttpError(400, "Use your managed authentication reset link.");
      await consumeToken(b.token, "reset", async (t, q) => {
        await q("UPDATE users SET password_hash=$1 WHERE id=$2", [
          passwordHash(b.password),
          t.user_id,
        ]);
        await q("DELETE FROM sessions WHERE user_id=$1", [t.user_id]);
      });
      return Response.json({ message: "Password updated. Please log in." });
    }
    if (action === "logout") {
      const c = await cookies();
      const t = c.get("mywed_session")?.value;
      if (t) await query("DELETE FROM sessions WHERE token_hash=$1", [hash(t)]);
      c.delete("mywed_session");
      c.delete("mywed_company");
      return Response.json({ message: "Logged out." });
    }
    const u = await identity();
    if (action === "create-company") {
      z.string().min(2).max(150).parse(b.name);
      const id = randomUUID();
      const currency = z
        .string()
        .regex(/^[A-Z]{3}$/)
        .parse(b.currency || "INR");
      const timezone = b.timezone || "Asia/Kolkata";
      try {
        new Intl.DateTimeFormat("en", { timeZone: timezone });
      } catch {
        throw new HttpError(400, "Invalid timezone.");
      }
      const fy = z.coerce
        .number()
        .int()
        .min(1)
        .max(12)
        .parse(b.fy_start || 4);
      await transaction(async (q) => {
        await q(
          "INSERT INTO companies(id,name,contact,logo,currency,timezone,fy_start,defaults) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            id,
            b.name,
            b.contact || "",
            b.logo || "",
            currency,
            timezone,
            fy,
            JSON.stringify(defaults),
          ],
        );
        await q("INSERT INTO members VALUES($1,$2,'Owner')", [id, u.id]);
      });
      (await cookies()).set("mywed_company", id, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
      return Response.json({ message: "Your empty workspace is ready." });
    }
    if (action === "switch-company") {
      await context(b.company_id);
      (await cookies()).set("mywed_company", b.company_id, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
      return Response.json({ message: "Workspace switched." });
    }
    if (action === "accept-invite") {
      await consumeToken(b.token, "invite", async (t, q) => {
        if (t.email !== u.email)
          throw new HttpError(403, "Log in with the invited email address.");
        await q(
          "INSERT INTO members VALUES($1,$2,$3) ON CONFLICT(company_id,user_id) DO NOTHING",
          [t.company_id, u.id, t.role],
        );
      });
      return Response.json({
        message: "Invitation accepted. Choose the workspace.",
      });
    }
    const ctx = await context();
    owner(ctx);
    if (action === "invite") {
      z.string().email().parse(email);
      const role = z.enum(["Manager", "Accountant", "Staff"]).parse(b.role);
      await issueToken(null, email, "invite", ctx.companyId, role);
      return Response.json({ message: "Invitation sent." });
    }
    if (action === "member-role") {
      const role = z.enum(["Manager", "Accountant", "Staff"]).parse(b.role);
      const { rows } = await query(
        "UPDATE members SET role=$1 WHERE company_id=$2 AND user_id=$3 AND role<>'Owner' RETURNING *",
        [role, ctx.companyId, b.user_id],
      );
      if (!rows.length)
        throw new HttpError(400, "Owner membership cannot be changed.");
      return Response.json({ message: "Role updated." });
    }
    if (action === "remove-member") {
      await query(
        "DELETE FROM members WHERE company_id=$1 AND user_id=$2 AND role<>'Owner'",
        [ctx.companyId, b.user_id],
      );
      return Response.json({ message: "Member removed." });
    }
    throw new HttpError(400, "Unknown account action.");
  } catch (e) {
    return errorResponse(e);
  }
}
