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

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  // 1. Store the raw file (Supabase Storage bucket 'documents')
  const path = `booking-confirmations/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, buffer, { contentType: "application/pdf" });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // 2. Run extraction
  let extracted;
  try {
    extracted = await extractBookingFromPdf(base64);
  } catch (err: any) {
    return NextResponse.json({ error: `Extraction failed: ${err.message}` }, { status: 502 });
  }

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
