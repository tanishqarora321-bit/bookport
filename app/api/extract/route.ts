export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { extractBookingFromPdf } from "@/lib/gemini";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const bookingId = form.get("booking_id") as string | null; // null if extraction happens before a booking row exists

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const supabase = createServiceClient();

  if (bookingId) {
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id")
      .eq("id", bookingId)
      .eq("company_id", me.company_id)
      .single();
    if (bookingError || !booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
  }

  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "File is too large (max 20 MB)." }, { status: 413 });
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return NextResponse.json({ error: "Please upload the booking confirmation as a PDF." }, { status: 400 });
  }
  const base64 = buffer.toString("base64");

  // 1 + 2. Store the raw file (Supabase Storage bucket 'documents') and run
  // the extraction at the same time - the upload no longer adds to the wait.
  // The file name is the uploader's - keep only safe characters (no "../" or slashes in the storage path).
  const safeName = (file.name || "booking.pdf").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(0, 120) || "booking.pdf";
  const path = `booking-confirmations/${me.company_id}/${Date.now()}-${safeName}`;
  const [{ error: uploadError }, extraction] = await Promise.all([
    supabase.storage.from("documents").upload(path, buffer, { contentType: "application/pdf" }),
    extractBookingFromPdf(base64).then(
      (value) => ({ value, error: null as any }),
      (error) => ({ value: null, error })
    ),
  ]);

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }
  if (extraction.error) {
    return NextResponse.json({ error: `Extraction failed: ${extraction.error.message}` }, { status: 502 });
  }
  const extracted = extraction.value;

  // 3. Store raw + extracted for the review screen (never auto-saved into bookings)
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .insert({
      booking_id: bookingId,
      doc_type: "booking_confirmation",
      file_path: path,
      extraction_status: "extracted",
      extracted_json: extracted,
      model_used: process.env.GEMINI_MODEL || "gemini-2.0-flash-lite"
    })
    .select()
    .single();

  if (docError) {
    return NextResponse.json({ error: docError.message }, { status: 500 });
  }

  return NextResponse.json({ document: doc, extracted });
}
