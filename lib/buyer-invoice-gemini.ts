import { GoogleGenerativeAI } from "@google/generative-ai";
import { buyerInvoiceExtractionSchema as schema } from "./buyer-invoice-schema";

// Separate genAI instance from lib/gemini.ts on purpose, same reasoning as
// lib/supplier-invoice-gemini.ts - keeps the booking-extraction path
// untouched.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/**
 * Extracts a buyer's own sales invoice PDF (a Final-Invoice style
 * document) into invoice number/date/currency/booking/container/weight
 * plus its charge lines. Never auto-saves; the caller always shows it in
 * the same manual-entry form for review before writing anything.
 */
export async function extractBuyerInvoiceFromPdf(fileBase64: string) {
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
    generationConfig: {
      responseMimeType: "application/json",
      // @ts-expect-error - responseSchema accepts a plain JSON-schema object
      responseSchema: schema,
      maxOutputTokens: 2048
    }
  });

  const prompt = `You are extracting a buyer's sales invoice PDF (a "Final Invoice" style
document - Booking #/Container #/Terms/Ship Date/Ship Via/Seal #/Reference #,
then a Weight/Qty/Rate/Amount section) into the given JSON schema. Find the
invoice number, invoice date, currency, booking number, container number,
total weight (and its unit, LBS or KG), bale/unit quantity if printed, and
every charge line (e.g. the cargo value line like "39 Bales Mixed Rags 38950
LBS@0.15=$5842.5", plus lines like "Trucking @=$850", "Commission @=$389.5",
"Ocean Freight @=$1847"). Each charge line becomes one item with just its
description and amount. Dates must be ISO 8601 (YYYY-MM-DD). Include every
line item found, even if some fields are missing.`;

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType: "application/pdf", data: fileBase64 } }
  ]);

  return JSON.parse(result.response.text());
}
