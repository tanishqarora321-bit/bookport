import { GoogleGenerativeAI } from "@google/generative-ai";
import { truckerInvoiceExtractionSchema as schema } from "./trucker-invoice-schema";

// Separate genAI instance from lib/gemini.ts on purpose, same reasoning as
// lib/forwarder-invoice-gemini.ts - keeps the booking-extraction path untouched.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/**
 * Extracts the invoice-specific numbers from a trucker's invoice/freight
 * bill PDF. The invoice row itself already exists (auto-created from the
 * booking's tracking entry) - this only fills in what a human would
 * otherwise type from the PDF, and never auto-saves; the caller always
 * shows it for review before writing anything.
 */
export async function extractTruckerInvoiceFromPdf(fileBase64: string) {
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-flash-lite-latest",
    generationConfig: {
      responseMimeType: "application/json",
      // @ts-expect-error - responseSchema accepts a plain JSON-schema object
      responseSchema: schema,
      maxOutputTokens: 1024
    }
  });

  const prompt = `You are extracting a trucking company's invoice/freight bill PDF into the
given JSON schema. This is a billing document from a trucker to their client -
find the invoice number, invoice date, due date, pickup/delivery location,
currency, and each charge line (base trucking/line-haul/freight, fuel
surcharge, chassis rental, stop-off, chassis split). Use 0 for a charge type
that isn't itemized on this invoice, never null, so totals compute correctly.
Dates must be ISO 8601 (YYYY-MM-DD).

For any charge line that doesn't fit one of those named fields: if it's
vague/small (a generic "misc" or "other" line), put it in misc_charges. If it
has its own specific name that's clearly a distinct charge type (e.g.
"Pre-Pull", "Detention", "Lumper Fee"), list it in other_charges instead,
with its exact printed name and amount, so it isn't silently merged into
misc_charges and lost.`;

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType: "application/pdf", data: fileBase64 } }
  ]);

  return JSON.parse(result.response.text());
}
