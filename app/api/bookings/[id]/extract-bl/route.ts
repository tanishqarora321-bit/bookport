import { NextRequest, NextResponse } from "next/server";
import { extractBLFromPdf } from "@/lib/gemini";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

export const maxDuration = 60;

// "Upload BL" on Booking & Instructions - same shape as app/api/extract/
// route.ts (booking-confirmation PDFs), scoped to an existing booking
// since a BL is always uploaded against one. Never auto-saves - the
// caller shows a review screen, then POSTs the confirmed values to
// apply-bl-extraction.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const supabase = createServiceClient();

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", params.id)
    .eq("company_id", me.company_id)
    .single();
  if (bookingError || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  const path = `bills-of-lading/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, buffer, { contentType: "application/pdf" });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  let extracted;
  try {
    extracted = await extractBLFromPdf(base64);
  } catch (err: any) {
    return NextResponse.json({ error: `Extraction failed: ${err.message}` }, { status: 502 });
  }

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .insert({
      booking_id: params.id,
      doc_type: "bill_of_lading",
      file_path: path,
      extraction_status: "extracted",
      extracted_json: extracted,
      model_used: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite"
    })
    .select()
    .single();
  if (docError) {
    return NextResponse.json({ error: docError.message }, { status: 500 });
  }

  return NextResponse.json({ document: doc, extracted });
}
