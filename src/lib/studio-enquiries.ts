import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import { query } from "./db";

const text = (max: number) => z.string().trim().min(1).max(max);
const phone = text(24).refine((value) => {
  const digits = value.replace(/\D/g, "");
  return (
    /^[+\d\s().-]+$/.test(value) && digits.length >= 10 && digits.length <= 15
  );
});
const date = z.string().refine((value) => {
  if (value === "") return true;
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
});
export const enquirySchema = z
  .object({
    id: z.string().uuid(),
    bride: text(100),
    bridePhone: phone,
    groom: text(100),
    groomPhone: phone,
    email: z.union([z.literal(""), z.string().trim().email().max(254)]),
    preferredContact: z.enum(["Bride", "Groom", "Either of us"]),
    events: z
      .array(
        z
          .object({
            type: z.enum([
              "Wedding",
              "Engagement",
              "Reception",
              "Haldi",
              "Mehendi",
              "Sangeet",
              "Pre-wedding shoot",
              "Post-wedding shoot",
              "Other celebration",
            ]),
            date,
            venue: text(200),
            services: z
              .array(
                z.enum([
                  "Candid photography",
                  "Traditional photography",
                  "Cinematic videography",
                  "Traditional videography",
                  "Drone",
                  "Live streaming",
                  "Help us decide",
                ]),
              )
              .min(1)
              .max(7),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    album: z.enum([
      "Hardcopy album + soft copies",
      "Soft copies only",
      "No album — discuss delivery with us",
      "Help us decide",
    ]),
    budget: z.enum([
      "Not specified",
      "Below ₹50,000",
      "₹50,000–₹1,00,000",
      "₹1,00,000–₹2,00,000",
      "₹2,00,000–₹3,00,000",
      "Above ₹3,00,000",
      "Let’s discuss",
    ]),
    notes: z.string().trim().max(2000),
    consent: z.literal(true),
    website: z.literal(""), // Honeypot, not a real customer field.
  })
  .strict();

export async function allowEnquiry(ip: string) {
  const secret = process.env.ENQUIRY_RATE_LIMIT_SECRET;
  if (process.env.NODE_ENV === "production" && !secret)
    throw new Error("Missing rate-limit configuration");
  const key = createHmac("sha256", secret || "local-development-only")
    .update(ip)
    .digest("hex");
  const result = await query(
    `INSERT INTO studio_request_limits(key_hash,window_start,attempts)
     VALUES($1,date_trunc('hour',now()),1)
     ON CONFLICT(key_hash) DO UPDATE SET
       window_start=date_trunc('hour',now()),
       attempts=CASE WHEN studio_request_limits.window_start=date_trunc('hour',now())
                     THEN studio_request_limits.attempts+1 ELSE 1 END
     RETURNING attempts`,
    [key],
  );
  return Number(result.rows[0].attempts) <= 20;
}

export async function storeEnquiry(input: unknown) {
  const parsed = enquirySchema.parse(input);
  const { id, website: _website, ...payload } = parsed;
  const encoded = JSON.stringify(payload);
  const hash = createHash("sha256").update(encoded).digest("hex");
  const result = await query(
    `INSERT INTO studio_enquiries(id,payload,payload_hash) VALUES($1,$2,$3)
     ON CONFLICT(id) DO NOTHING RETURNING id`,
    [id, encoded, hash],
  );
  if (!result.rows.length) {
    const existing = await query(
      "SELECT payload_hash FROM studio_enquiries WHERE id=$1",
      [id],
    );
    if (existing.rows[0]?.payload_hash !== hash)
      return { conflict: true as const };
  }
  return { id };
}
