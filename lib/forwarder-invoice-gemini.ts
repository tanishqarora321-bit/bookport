import { GoogleGenerativeAI } from "@google/generative-ai";
import { forwarderInvoiceExtractionSchema as schema } from "./forwarder-invoice-schema";

// Separate genAI instance from lib/gemini.ts on purpose, same reasoning as
// lib/rate-sheet-gemini.ts - keeps the booking-extraction path untouched.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/**
 * Extracts the invoice-specific numbers from a forwarder's invoice PDF.
 * The invoice row itself already exists (auto-created from the booking's
 * tracking entry) - this only fills in what a human would otherwise type
 * from the PDF, and never auto-saves; the caller always shows it for
 * review before writing anything.
 */
export async function extractForwarderInvoiceFromPdf(fileBase64: string) {
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-flash-lite-latest",
    generationConfig: {
      responseMimeType: "application/json",
      // @ts-expect-error - responseSchema accepts a plain JSON-schema object
      responseSchema: schema,
      maxOutputTokens: 1024
    }
  });

  const prompt = `You are extracting a freight forwarder's invoice PDF into the given JSON
schema. This is a billing document from a forwarder to their client - find
the invoice number, invoice date, due date, currency, and each charge line
(freight, BL fee, AES filing fee, correction charge, demurrage/detention,
and any other miscellaneous charge as "extra_charges"). Use 0 for a charge
type that isn't itemized on this invoice, never null, so totals compute
correctly. Dates must be ISO 8601 (YYYY-MM-DD).`;

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType: "application/pdf", data: fileBase64 } }
  ]);

  return JSON.parse(result.response.text());
}
