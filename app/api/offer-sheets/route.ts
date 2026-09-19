import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { computeAllRows, ColumnDef } from "@/lib/offer-sheet-compute";

// Adds one row of raw inputs to a sheet. Only keys that are actually
// text/number/date columns on this sheet's type get stored -- a
// "computed" key sent by mistake (or a stray extra field) is silently
// dropped rather than stored as junk that would never be recalculated.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const supabase = createServiceClient();

  const { data: sheet, error: sheetError } = await supabase
    .from("offer_sheets")
    .select("id, settings, offer_sheet_type_id, offer_sheet_types (columns)")
    .eq("id", params.id)
    .single();

  if (sheetError || !sheet) {
    return NextResponse.json({ error: sheetError?.message || "Sheet not found" }, { status: 404 });
  }

  const columns: ColumnDef[] = (sheet as any).offer_sheet_types?.columns ?? [];
  const inputKeys = new Set(columns.filter((c) => c.kind !== "computed").map((c) => c.key));

  const rowData: Record<string, any> = {};
  for (const [key, value] of Object.entries(body.row_data || {})) {
    if (inputKeys.has(key)) rowData[key] = value;
  }

  const { data: existing } = await supabase
    .from("offer_sheet_rows")
    .select("sort_order")
    .eq("offer_sheet_id", params.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: newRow, error: insertError } = await supabase
    .from("offer_sheet_rows")
    .insert({
      offer_sheet_id: params.id,
      group_key: body.group_key || null,
      row_data: rowData,
      sort_order: (existing?.sort_order ?? -1) + 1,
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Return this row (and its group siblings, if any) fully computed --
  // matches the pattern in items/[itemId] routes: the client updates from
  // whatever comes back rather than recomputing formulas itself.
  let siblingRows = [newRow];
  if (newRow.group_key) {
    const { data: groupRows } = await supabase
      .from("offer_sheet_rows")
      .select("id, group_key, row_data")
      .eq("offer_sheet_id", params.id)
      .eq("group_key", newRow.group_key);
    siblingRows = groupRows ?? [newRow];
  }

  const computed = computeAllRows(columns, siblingRows as any, sheet.settings || {});

  return NextResponse.json({ row: newRow, computed_rows: computed });
}
