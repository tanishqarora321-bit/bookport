import { GoogleGenerativeAI } from "@google/generative-ai";
import { packingListExtractionSchema as schema } from "./packing-list-schema";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/**
 * Extracts Seal No / total Weight / Bale count from an uploaded packing
 * list or Bill of Lading PDF. Never auto-saves; the caller always shows
 * it for review before writing anything, same "AI-filled, always
 * correctable" pattern as every other PDF extraction in this app.
 */
export async function extractPackingListFromPdf(fileBase64: string) {
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
    generationConfig: {
      responseMimeType: "application/json",
      // @ts-expect-error - responseSchema accepts a plain JSON-schema object
      responseSchema: schema,
      maxOutputTokens: 512
    }
  });

  const prompt = `You are extracting a packing list / Bill of Lading PDF for ONE shipping
container. Find the container number, seal number, and the TOTAL weight and
bale/package count - if the document lists individual bale weights in a
grid, add them up for the total weight and count the rows for the bale
count rather than returning a single bale's numbers. State which unit
(LBS or KG) the weight is actually in.`;

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType: "application/pdf", data: fileBase64 } }
  ]);

  return JSON.parse(result.response.text());
}
