import { GoogleGenerativeAI } from "@google/generative-ai";
import { rateSheetExtractionSchema as schema } from "./rate-sheet-schema";

// Separate genAI instance from lib/gemini.ts on purpose -- this keeps the
// (already working, don't touch) booking-extraction path completely
// untouched by anything this module does, per the "smaller, more targeted
// file drops" recommendation from the last handoff.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/**
 * Extracts every (origin, shipping_line, rate, free_days) row from a
 * forwarder's rate-sheet PDF. Like booking extraction, this never
 * auto-saves -- the API route inserts what comes back directly into
 * rate_sheet_entries, but every cell stays editable afterward (same
 * "amber for AI-filled, always correctable" spirit as Booking & Instructions,
 * just without the separate review screen for this first version).
 */
export async function extractRateSheetFromPdf(fileBase64: string) {
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-flash-lite-latest",
    generationConfig: {
      responseMimeType: "application/json",
      // @ts-expect-error - responseSchema accepts a plain JSON-schema object
      responseSchema: schema,
      maxOutputTokens: 8192, // these sheets run 40-90 rate cells -- booking's 2048 would truncate
    },
  });

  const prompt = `You are extracting a freight rate sheet (a table of ocean freight rates by
origin and shipping line, usually to one destination port) into the given
JSON schema.

Rules:
- One entry per non-blank rate cell. A cell showing "-", blank, or "N/A"
  means no rate is offered for that origin+carrier combination -- do NOT
  create an entry for it at all.
- "origin" is the US/Canada city, port, or rail ramp the cargo departs from
  (the row label), not the destination (these sheets are always to a single
  fixed destination, which is handled outside this extraction).
- "shipping_line" is the ocean carrier column header (MSC, MAERSK, HAPAG,
  HAPAG-LLOYD, COSCO, CMA CGM, ONE, HMM, EVERGREEN, OOCL, ZIM, etc.) --
  normalize obvious abbreviations to the full carrier name where clear
  (e.g. "HLAG" -> "HAPAG", "EMC" -> "EVERGREEN") but don't guess if unsure.
- "free_days" is the number of free days at destination for that carrier,
  if the sheet states it anywhere (a per-column note, a table under the main
  grid, or a footer line like "12 free days at destination on HAPAG/MSC").
  Apply the same free_days value to every entry for that carrier. Leave null
  if the sheet never states free days for that carrier.
- Ignore surcharge/fee footnotes (BL fees, AES filing, manifest correction
  charges, demurrage/detention terms) entirely -- those aren't rate cells.`;

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType: "application/pdf", data: fileBase64 } },
  ]);

  return JSON.parse(result.response.text());
}
