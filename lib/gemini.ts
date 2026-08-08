import { GoogleGenerativeAI } from "@google/generative-ai";
import { bookingExtractionSchema as schema } from "./booking-schema";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/**
 * Extracts the 11 core Booking & Instructions fields from a booking PDF.
 * Cost at this tier: fractions of a cent per booking. Never auto-saves the
 * result — the caller writes it to documents.extracted_json for the human
 * review screen; nothing here is trusted until a person confirms it.
 */
export async function extractBookingFromPdf(fileBase64: string) {
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-flash-lite-latest",
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
