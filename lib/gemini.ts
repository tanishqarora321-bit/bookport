import { GoogleGenerativeAI } from "@google/generative-ai";
import { bookingExtractionSchema as schema } from "./booking-schema";
import { blExtractionSchema } from "./bl-schema";
import { IMPORT_FIELDS } from "./booking-import-fields";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/**
 * Extracts the 11 core Booking & Instructions fields from a booking PDF.
 * Cost at this tier: fractions of a cent per booking. Never auto-saves the
 * result — the caller writes it to documents.extracted_json for the human
 * review screen; nothing here is trusted until a person confirms it.
 */
export async function extractBookingFromPdf(fileBase64: string) {
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
    generationConfig: {
      responseMimeType: "application/json",
      // @ts-expect-error - responseSchema accepts a plain JSON-schema object
      responseSchema: schema,
      maxOutputTokens: 2048
    }
  });

  const prompt = `You are extracting exactly 11 fields from a shipping/freight booking confirmation
PDF into the given JSON schema. For every field, also return "source_quote"
(the exact phrase the value came from - 15 words maximum, never a full
sentence or paragraph, and never the legal/terms-and-conditions boilerplate
these documents are full of) and "confidence" 0-1.

If a field is genuinely absent from this document, set value to null rather
than guessing - except booking_number, which is mandatory: it always appears
on the page somewhere, even if under an unusual label.

Field-by-field guidance (these labels vary a lot between carriers/forwarders -
match the meaning, not the literal words):

1. booking_number (MANDATORY) - look for "Booking No.", "Booking Number",
   "Booking Confirmation No.", "Our Reference", "OUR REF.", "BKG NO.",
   "Carrier Booking No.". If a document shows both a forwarder's own
   reference and the carrier's booking number, prefer the carrier's number.

2. erd - "Earliest Release Date", "ERD", "First Gate In Date for Demurrage
   Free Date". Do NOT confuse with "Empty Pick Up Date" - that's a different
   concept (when the shipper collects the empty container, not when the
   terminal will accept the full one). If no ERD-labeled field exists on the
   page, leave null.

3. doc_cutoff - "Doc Cut Off", "SI Cut-off", "Shipping Instruction Closing",
   "DOC CLOSING", "AMS Closing (BL Instructions)". This is the deadline to
   submit final shipping instructions/BL data, not the container gate-in
   deadline.

4. cargo_cutoff - "Cargo Cut Off", "FCL delivery cut-off", "CTR Closing",
   "Port Cut-off", "Port Cargo Cut-off". This is the deadline for the loaded
   container to be gated in at the terminal.

5. pol - Port of Loading. May appear as a city+country pair; return the
   port/city name.

6. port_of_discharge - the SEA port where the vessel unloads (e.g. Mundra),
   NOT the final inland destination.

7. port_of_delivery - the final delivery point, which is very often different
   from port_of_discharge (e.g. an inland ICD like "ICD PATLI" reached by
   rail/truck after Mundra). Look for "Place of Delivery", "Final
   Destination", "PLACE OF DELIVERY". If the document only states one
   location for both discharge and delivery, it's fine for these two fields
   to end up identical - don't force them to differ.

8. bl_issued_at - "B/L Issued At", "BL Issued At" - a city name, e.g. "LOS
   ANGELES, CA". Often absent; leave null if so.

9. shipping_line - the ocean carrier / vessel operator (Maersk, HMM,
   Evergreen, COSCO, Hapag-Lloyd, ONE, etc.), sometimes labeled "Carrier",
   "Shipping Line", or "On behalf of".

10. forwarder_name - the freight forwarder or booking party - NOT the
    shipping line. Look for "Forwarder", "Customer", "Booked by Party",
    "Shipper" at or near the top of the document. On forwarder-issued
    documents (as opposed to carrier-issued ones) this is often the company
    the document is addressed "To:".

11. container_size - the container count/type string as shown, e.g.
    "1x40'HI-CUBE", "2x40HC", "1x45GP". Copy the format the document uses
    rather than normalizing it.
`;

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType: "application/pdf", data: fileBase64 } }
  ]);

  return JSON.parse(result.response.text());
}

/**
 * Extracts Bill of Lading fields from an uploaded BL PDF (Booking &
 * Instructions' "Upload BL") - booking_no/BL number, the BL's own issue
 * date (feeds "3 days after BL issued date" used by Fumigation
 * Certificate / Certificate of Origin / Commercial Invoice generation),
 * routing, and one container/seal/weight/bales line per container shown
 * on the BL. Same never-auto-saved contract as extractBookingFromPdf -
 * the caller logs this to documents.extracted_json for a human review
 * screen; nothing here writes to bookings/containers directly.
 */
export async function extractBLFromPdf(fileBase64: string) {
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
    generationConfig: {
      responseMimeType: "application/json",
      // @ts-expect-error - responseSchema accepts a plain JSON-schema object
      responseSchema: blExtractionSchema,
      maxOutputTokens: 3072
    }
  });

  const prompt = `You are extracting fields from an ocean Bill of Lading (B/L) PDF into the
given JSON schema. For every scalar field, also return "source_quote" (the
exact phrase the value came from - 15 words maximum, never a full sentence
or paragraph, and never the legal/terms-and-conditions boilerplate these
documents are full of) and "confidence" 0-1.

If a field is genuinely absent, set its value to null rather than guessing -
except bl_number, which is mandatory: it always appears somewhere, even
under an unusual label.

Field-by-field guidance:

1. bl_number (MANDATORY) - "Bill of Lading No.", "B/L No.", "BL Number" -
   this is the CARRIER's own BL document number (e.g. "COSU6446078830"),
   NOT the booking number (which may also appear on the same document as
   a separate "Booking No." field - do not confuse the two).

2. bl_date - the BL's own issue date: "Date of Issue". If no explicit
   "Date of Issue" exists, "Date Laden on Board" is an acceptable fallback
   (used for the same purpose on most B/Ls). Return as an ISO 8601 date.

3. place_of_issue - "Place of Issue" - a city name, e.g. "HOUSTON".

4. vessel - the vessel name, e.g. "XIN SHAN TOU", from "Ocean Vessel" or
   "Vessel/Voy. No." (the vessel name part only, not the voyage number).

5. voyage - the voyage number, e.g. "224S", from "Voy. No." or
   "Vessel/Voy. No." (the voyage part only, not the vessel name).

6. pol - Port of Loading.

7. pod - Port of Discharge (where the vessel unloads, not any further
   inland destination).

8. place_of_receipt - "Place of Receipt", "Combined Transport Place of
   Receipt" - often a different, usually inland, location than the Port
   of Loading (e.g. "SEATTLE, WA, US" vs. port "SEATTLE").

9. description_of_goods - the cargo description from the Marks & Numbers /
   Description of Goods block, e.g. "OLD AND USED WORN CLOTHING". Leave
   out incidental notes (fumigation stamps, shipper declarations, HS code)
   that aren't part of the actual goods description.

10. hs_code - "H.S. CODE", "HS Code", if shown.

11. containers - one entry per container/seal line in the Marks & Numbers
    block. container_no is the container number (e.g. "FCIU9844912"),
    seal_no the seal number (e.g. "UL8377521") - these are usually shown
    together separated by a slash. gross_weight and weight_unit come from
    the Gross Weight column (e.g. 18056 / "KGS"). bales is the package/
    bale/carton count for that specific container. If the B/L covers only
    one container, return a single-item array.
`;

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType: "application/pdf", data: fileBase64 } }
  ]);

  return JSON.parse(result.response.text());
}

/**
 * Suggests which spreadsheet header best matches each Booking &
 * Instructions field, for the Excel import mapping screen
 * (app/bookings/import/page.tsx). This is only ever a pre-filled
 * suggestion - the user reviews and can override every field before
 * anything is imported, so a wrong guess here costs a dropdown change,
 * never bad data.
 */
export async function suggestColumnMapping(headers: string[]): Promise<Record<string, string | null>> {
  return suggestMapping(headers, IMPORT_FIELDS, "freight booking");
}

/**
 * Generic version of the above, reused by the party import flow
 * (Forwarders/Truckers/Suppliers/Buyers - components/PartyImportClient.tsx)
 * so every Excel import in the app gets the same AI-assisted, always
 * user-reviewed mapping step without duplicating the prompt.
 */
export async function suggestMapping(
  headers: string[],
  fields: { key: string; label: string }[],
  subjectLabel: string
): Promise<Record<string, string | null>> {
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
    generationConfig: { responseMimeType: "application/json", maxOutputTokens: 512 }
  });

  const fieldList = fields.map((f) => `"${f.key}" (${f.label})`).join(", ");
  const keys = fields.map((f) => f.key);

  const prompt = `A user is importing a ${subjectLabel} spreadsheet into a database. Its column
headers, in order, are:
${headers.map((h, i) => `${i}: ${JSON.stringify(h)}`).join("\n")}

For each of these target fields: ${fieldList}
pick the single best-matching header from the list above by its EXACT text
(copy it verbatim, don't paraphrase), or null if nothing in the sheet matches
that field's meaning.

Respond with ONLY a JSON object whose keys are exactly: ${JSON.stringify(keys)}
and whose values are each either one of the exact header strings above, or null.`;

  // Gemini's free tier returns a plain 503 "experiencing high demand" often
  // enough in practice that a single failed call used to make every field
  // on an import screen show up as "Skip" with zero explanation (found
  // live, confirmed in production logs as a genuine transient error on
  // Google's side, not a bug in this code). A couple of short, quiet
  // retries clears most of them before the caller ever has to fall back to
  // its own "suggestionFailed" messaging.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return JSON.parse(result.response.text());
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr;
}
