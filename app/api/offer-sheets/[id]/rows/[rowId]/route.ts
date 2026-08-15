import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { computeAllRows, ColumnDef } from "@/lib/offer-sheet-compute";

// Edits one raw input field on one row (an EditableCell save). Because a
// group-scoped field (e.g. Bed Sheet's shared freight/trucking) affects
// every row in that group's computed columns, this returns every row in
// the group, freshly recomputed -- not just the row that was actually
// clicked -- so the client can update its whole group's numbers, not just
// one cell, from a single response.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; rowId: string } }
) {
  const body = await req.json();
  const supabase = createServiceClient();

  const { data: sheet, error: sheetError } = await supabase
    .from("offer_sheets")
    .select("id, settings, offer_sheet_types (columns)")
    .eq("id", params.id)
    .single();

  if (sheetError || !sheet) {
    return NextResponse.json({ error: sheetError?.message || "Sheet not found" }, { status: 404 });
  }

  const columns: ColumnDef[] = (sheet as any).offer_sheet_types?.columns ?? [];
  const inputKeys = new Set(columns.filter((c) => c.kind !== "computed").map((c) => c.key));

  const { data: existingRow, error: rowError } = await supabase
    .from("offer_sheet_rows")
    .select("id, group_key, row_data")
    .eq("id", params.rowId)
    .eq("offer_sheet_id", params.id)
    .single();

  if (rowError || !existingRow) {
    return NextResponse.json({ error: rowError?.message || "Row not found" }, { status: 404 });
  }

  const patch: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (inputKeys.has(key)) patch[key] = value === "" ? null : value;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No editable fields in request" }, { status: 400 });
  }

  const newRowData = { ...existingRow.row_data, ...patch };

  const { error: updateError } = await supabase
    .from("offer_sheet_rows")
    .update({ row_data: newRowData })
    .eq("id", params.rowId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  let groupRows = [{ id: existingRow.id, group_key: existingRow.group_key, row_data: newRowData }];
  if (existingRow.group_key) {
    const { data: rows } = await supabase
      .from("offer_sheet_rows")
      .select("id, group_key, row_data")
      .eq("offer_sheet_id", params.id)
      .eq("group_key", existingRow.group_key);
    groupRows = (rows ?? []).map((r: { id: string; group_key: string | null; row_data: Record<string, any> }) =>
      r.id === existingRow.id ? { ...r, row_data: newRowData } : r
    );
  }

  const computed = computeAllRows(columns, groupRows as any, sheet.settings || {});

  return NextResponse.json({ computed_rows: computed });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; rowId: string } }
) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("offer_sheet_rows")
    .delete()
    .eq("id", params.rowId)
    .eq("offer_sheet_id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
