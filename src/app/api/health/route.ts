import { query } from "@/lib/db";
import { databaseDiagnostic } from "@/lib/database-diagnostic";
export const runtime = "nodejs";
export async function GET() {
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
    console.error(
      "[MyWed health] DATABASE_URL is missing. Set the Neon connection URL in Render Environment.",
    );
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    await query("SELECT 1");
    return Response.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(`[MyWed health] ${databaseDiagnostic(error)}`);
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
