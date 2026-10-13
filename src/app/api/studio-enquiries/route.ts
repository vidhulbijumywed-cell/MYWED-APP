import { z } from "zod";
import { allowEnquiry, storeEnquiry } from "@/lib/studio-enquiries";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) =>
  Response.json({ error }, { status, headers });

export async function POST(req: Request) {
  try {
    const origin = req.headers.get("origin");
    const expected = new URL(req.url);
    const host = req.headers.get("host");
    if (host) expected.host = host;
    const canonical =
      process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || expected.origin;
    if (
      !origin ||
      origin !== new URL(canonical).origin ||
      req.headers.get("sec-fetch-site") === "cross-site"
    ) {
      return fail("Please submit from the Mywed.in website.", 403);
    }
    if (!req.headers.get("content-type")?.startsWith("application/json"))
      return fail("JSON required.", 415);
    // Stream with a hard bound; do not allocate an unbounded request body.
    const reader = req.body?.getReader();
    if (!reader) return fail("Missing enquiry.", 400);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 24000) {
        await reader.cancel();
        return fail("Enquiry is too large.", 413);
      }
      chunks.push(value);
    }
    if (
      process.env.NODE_ENV === "production" &&
      (!process.env.DATABASE_URL || !process.env.ENQUIRY_RATE_LIMIT_SECRET)
    ) {
      return fail(
        "Online enquiries are temporarily unavailable. Please call or WhatsApp us.",
        503,
      );
    }
    // Render's ingress appends the client address. Do not trust caller-added leading entries.
    const ip =
      req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
      "unknown";
    if (!(await allowEnquiry(ip)))
      return fail(
        "Too many attempts. Please try again later or contact us directly.",
        429,
      );
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const result = await storeEnquiry(input);
    if ("conflict" in result)
      return fail("Enquiry changed. Review your details and try again.", 409);
    return Response.json(
      {
        id: result.id,
        message: "Your enquiry has been saved. Our team will contact you.",
      },
      { status: 201, headers },
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return fail(
        "Please check the required contact details, events, services, and consent.",
        400,
      );
    // Do not log phone numbers, submitted payloads, or connection credentials.
    return fail(
      "We could not save your enquiry. Please retry or contact us directly.",
      503,
    );
  }
}
