import { GoogleGenerativeAI } from "@google/generative-ai";
import { fastModel } from "./gemini-fast";
import { rateSheetExtractionSchema as schema } from "./rate-sheet-schema";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export type ExtractedRateSheet = {
  forwarder_name: string | null;
  entries: { origin: string; shipping_line: string; rate: number | null; free_days: number | null }[];
  charges: { label: string; amount: number | null; shipping_lines: string[] }[];
};

const PROMPT = `You are reading a forwarder's monthly ocean-freight rate sheet (usually an
email or spreadsheet: a table of rates by origin and shipping line to ONE
destination port, e.g. Mundra, India) into the given JSON schema.

Rules:
- One entry per rate cell that has a number. A cell showing "-", "--",
  blank or "N/A" means no rate: do NOT create an entry for it.
- "origin" is the row label (US/Canada city, port or rail ramp), exactly as
  written. Never the destination.
- "shipping_line" is the carrier column header (COSCO, EVERGREEN, OOCL,
  HAPAG-LLOYD, ONE, MAERSK, CMA CGM, MSC, HMM, ZIM, WAN HAI...). Normalize
  obvious abbreviations ("HLAG"/"HAPAG" -> "HAPAG-LLOYD", "EMC" ->
  "EVERGREEN", "ONE LINE" -> "ONE", "CMA" -> "CMA CGM"); don't guess if unsure.
- A rate written in the text rather than the table (e.g. "WAN HAI : Los
  Angeles + Oakland = USD 2,100") is also an entry for each origin named.
- "free_days": destination free days per carrier, from a header row
  ("Calendar Days Free time 04 14 14"), a column note or a footer ("MSC: 12
  calendar days, all other carriers 14"). If it differs by origin for one
  carrier (e.g. "MAERSK 4 days Chicago & Miami, 8 days for the rest"), give
  each entry its own value. Null when never stated.
- Rates are plain numbers in USD (strip "$" and thousands commas).
- "forwarder_name": the company that SENT the rates (sender / signature /
  title, e.g. "UAL", "Walker SCM") - not the recipient, not a carrier.
- "charges": every extra charge listed (doc/telex release, AES filing,
  handling per BL, manifest correction, booking cancellation, no-show...)
  with its USD amount and the carriers it applies to (empty list = all).`;

function parse(text: string): ExtractedRateSheet {
  const json = JSON.parse(text);
  return {
    forwarder_name: json.forwarder_name ?? null,
    entries: Array.isArray(json.entries) ? json.entries : [],
    charges: Array.isArray(json.charges) ? json.charges : [],
  };
}

function model() {
  return fastModel(genAI, {
    model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
    generationConfig: {
      responseMimeType: "application/json",
      // @ts-expect-error - responseSchema accepts a plain JSON-schema object
      responseSchema: schema,
      // A sheet can carry 300+ rate cells (50 origins x 7 carriers).
      maxOutputTokens: 32768,
    },
  });
}

/** Reads a rate sheet PDF (e.g. UAL's or Walker's email). Never saved directly - reviewed first. */
export async function extractRateSheetFromPdf(fileBase64: string): Promise<ExtractedRateSheet> {
  const result = await model().generateContent([{ text: PROMPT }, { inlineData: { mimeType: "application/pdf", data: fileBase64 } }]);
  return parse(result.response.text());
}

/** Reads a rate sheet that arrived as a spreadsheet, given as tab-separated text (one block per sheet). */
export async function extractRateSheetFromTable(tableText: string, fileName: string): Promise<ExtractedRateSheet> {
  const result = await model().generateContent([
    { text: PROMPT },
    { text: `The rate sheet is a spreadsheet named "${fileName}", given below as tab-separated rows (blank cells are empty between tabs):\n\n${tableText}` },
  ]);
  return parse(result.response.text());
}
