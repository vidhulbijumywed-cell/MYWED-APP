import { query } from "@/lib/db";
export const runtime = "nodejs";
export async function GET() {
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
  try {
    await query("SELECT 1");
    return Response.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
