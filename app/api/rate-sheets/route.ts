import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

function numOrNull(v: any) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function intOrNull(v: any) {
  const n = numOrNull(v);
  return n === null ? null : Math.round(n);
}

// Creates one rate sheet, either from manually typed rows (JSON body) or
// from an uploaded PDF (multipart form) -- see the two modes in
// FreightComparisonClient's "Upload / Manual Entry" panel.
//
// NOTE: this file previously contained a near-duplicate of
// app/api/rate-sheets/[id]/entries/route.ts's "add one entry" logic (a
// copy/paste mistake from the original "Add Freight Comparison Module"
// commit - every file under app/api/rate-sheets/ had that same POST
// pasted into it). That meant POST /api/rate-sheets - the endpoint
// FreightComparisonClient actually calls to save a new sheet, either
// manual or PDF - always failed (it tried to insert a rate_sheet_entries
// row with rate_sheet_id: undefined, since this route has no [id]
// segment). Restored here to match what the client sends.
//
// PDF extraction itself (reading rates off the uploaded file) is NOT
// implemented anywhere in this codebase - there's no AI/OCR call for rate
// sheets the way lib/gemini has for booking confirmations. The PDF branch
// below records the sheet + the uploaded file's name so it shows up under
// "Manage uploaded rate sheets" and its rows can be typed in by hand from
// there; it does not read the PDF's contents. Flagged for Tanishq to
// decide whether real extraction is worth building, same as
// app/api/extract/route.ts does for booking confirmations.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const supabase = createServiceClient();
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const forwarder_name = (form.get("forwarder_name") as string | null)?.trim();
    const destination = (form.get("destination") as string | null)?.trim();
    const rate_month = form.get("rate_month") as string | null;
    const currency = (form.get("currency") as string | null) || "USD";

    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (!forwarder_name) return NextResponse.json({ error: "Forwarder name is required" }, { status: 400 });
    if (!rate_month) return NextResponse.json({ error: "Rate month is required" }, { status: 400 });

    const { data, error } = await supabase
      .from("rate_sheets")
      .insert({
        company_id: me.company_id,
        forwarder_name,
        destination: destination || "Mundra, IN",
        rate_month,
        currency,
        source_type: "pdf",
        source_file_name: file.name,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // entries_found is always 0 here - see the note above on why PDF
    // extraction isn't wired up yet.
    return NextResponse.json({ rate_sheet: data, entries_found: 0 });
  }

  const body = await req.json();
  const { forwarder_name, destination, rate_month, currency, entries } = body;

  if (!forwarder_name || !forwarder_name.trim()) {
    return NextResponse.json({ error: "Forwarder name is required" }, { status: 400 });
  }
  if (!rate_month) {
    return NextResponse.json({ error: "Rate month is required" }, { status: 400 });
  }

  const { data: sheet, error: sheetError } = await supabase
    .from("rate_sheets")
    .insert({
      company_id: me.company_id,
      forwarder_name: forwarder_name.trim(),
      destination: destination || "Mundra, IN",
      rate_month,
      currency: currency || "USD",
      source_type: "manual",
    })
    .select()
    .single();

  if (sheetError) return NextResponse.json({ error: sheetError.message }, { status: 500 });

  const validEntries = (Array.isArray(entries) ? entries : []).filter((e: any) => e.origin && e.shipping_line);
  if (validEntries.length > 0) {
    const { error: entriesError } = await supabase.from("rate_sheet_entries").insert(
      validEntries.map((e: any, i: number) => ({
        rate_sheet_id: sheet.id,
        origin: e.origin.toString().trim(),
        shipping_line: e.shipping_line.toString().trim(),
        rate: numOrNull(e.rate),
        free_days: intOrNull(e.free_days),
        sort_order: i,
      }))
    );
    if (entriesError) return NextResponse.json({ error: entriesError.message }, { status: 500 });
  }

  return NextResponse.json({ rate_sheet: sheet, entries_found: validEntries.length });
}
