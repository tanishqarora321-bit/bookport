import { GoogleGenerativeAI } from "@google/generative-ai";
import { supplierInvoiceExtractionSchema as schema } from "./supplier-invoice-schema";

// Separate genAI instance from lib/gemini.ts on purpose, same reasoning
// as lib/forwarder-invoice-gemini.ts - keeps the booking-extraction path
// untouched.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/**
 * Extracts a supplier invoice PDF's invoice number/date/currency and its
 * cost-section line items. Never auto-saves; the caller always shows it
 * in the same manual-entry form for review before writing anything.
 */
export async function extractSupplierInvoiceFromPdf(fileBase64: string) {
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-flash-lite-latest",
    generationConfig: {
      responseMimeType: "application/json",
      // @ts-expect-error - responseSchema accepts a plain JSON-schema object
      responseSchema: schema,
      maxOutputTokens: 2048
    }
  });

  const prompt = `You are extracting a supplier's invoice/statement PDF into the given JSON
schema. This is a billing document from a supplier (e.g. a recycler or goods
supplier) - find the invoice number, invoice date, currency, and every cost
line (each line typically has a description like a commodity name, a weight
in KG, a unit price, and an amount). If a line's amount isn't printed
separately, compute it as weight_kg * unit_price. Dates must be ISO 8601
(YYYY-MM-DD). Include every line item found, even if some fields on a line
are missing.`;

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType: "application/pdf", data: fileBase64 } }
  ]);

  return JSON.parse(result.response.text());
}
