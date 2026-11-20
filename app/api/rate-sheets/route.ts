import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { cleanAddOn } from "@/lib/rate-sheet-addon";

function numOrNull(v: any) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function intOrNull(v: any) {
  const n = numOrNull(v);
  return n === null ? null : Math.round(n);
}

// Saves one forwarder's rate sheet for a month (owner, 2026-11): the rows
// read from an uploaded PDF / Excel (reviewed first) or typed by hand, plus
// the amount added per container for the comparison. Uploading the same
// forwarder again for the same month and destination REPLACES its sheet
// (replace_existing, the default) instead of adding a duplicate column.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const supabase = createServiceClient();
  const body = await req.json();
  const { forwarder_name, destination, rate_month, currency, entries } = body;

  if (!forwarder_name || !forwarder_name.trim()) {
    return NextResponse.json({ error: "Forwarder name is required" }, { status: 400 });
  }
  if (!rate_month || !/^\d{4}-\d{2}/.test(rate_month)) {
    return NextResponse.json({ error: "Rate month is required" }, { status: 400 });
  }
  const month = `${String(rate_month).slice(0, 7)}-01`;
  const dest = (destination || "Mundra, IN").trim();
  const name = forwarder_name.trim();

  if (body.replace_existing !== false) {
    await supabase
      .from("rate_sheets")
      .delete()
      .eq("company_id", me.company_id)
      .eq("rate_month", month)
      .eq("destination", dest)
      .ilike("forwarder_name", name);
  }

  const base = {
    company_id: me.company_id,
    forwarder_name: name,
    destination: dest,
    rate_month: month,
    currency: currency || "USD",
    // The database only accepts "pdf" / "manual" here, so any uploaded file
    // (PDF or Excel) is stored as "pdf"; its file name says which it was.
    source_type: body.source_type === "manual" ? "manual" : "pdf",
    source_file_name: body.source_file_name || null,
  };
  let warning: string | null = null;
  let { data: sheet, error: sheetError } = await supabase.from("rate_sheets").insert({ ...base, ...cleanAddOn(body) }).select().single();
  if (sheetError && /add_on|charges_note/i.test(sheetError.message)) {
    // Migration 0041 not run yet - save the rates without the add-on.
    warning = "Saved without the per-container add-on: run supabase/migrations/0041_rate_sheet_charges.sql once in Supabase's SQL Editor.";
    ({ data: sheet, error: sheetError } = await supabase.from("rate_sheets").insert(base).select().single());
  }
  if (sheetError || !sheet) return NextResponse.json({ error: sheetError?.message ?? "Couldn't save" }, { status: 500 });

  const validEntries = (Array.isArray(entries) ? entries : []).filter((e: any) => e.origin && e.shipping_line && numOrNull(e.rate) !== null);
  for (let i = 0; i < validEntries.length; i += 500) {
    const { error: entriesError } = await supabase.from("rate_sheet_entries").insert(
      validEntries.slice(i, i + 500).map((e: any, j: number) => ({
        rate_sheet_id: sheet!.id,
        origin: e.origin.toString().trim(),
        shipping_line: e.shipping_line.toString().trim(),
        rate: numOrNull(e.rate),
        free_days: intOrNull(e.free_days),
        sort_order: i + j,
      }))
    );
    if (entriesError) return NextResponse.json({ error: entriesError.message }, { status: 500 });
  }

  return NextResponse.json({ rate_sheet: sheet, entries_found: validEntries.length, warning });
}
