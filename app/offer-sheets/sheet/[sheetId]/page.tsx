import { createServiceClient } from "@/lib/supabase/server";
import { computeAllRows, ColumnDef } from "@/lib/offer-sheet-compute";
import OfferSheetGridClient from "@/components/OfferSheetGridClient";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function OfferSheetGridPage({ params }: { params: { sheetId: string } }) {
  const supabase = createServiceClient();

  const { data: sheet, error: sheetError } = await supabase
    .from("offer_sheets")
    .select("id, title, period, settings, notes, offer_sheet_type_id, offer_sheet_types (id, name, columns)")
    .eq("id", params.sheetId)
    .single();

  if (sheetError || !sheet) {
    return (
      <div className="p-6">
        <p className="text-red-600">Offer sheet not found.</p>
        <Link href="/offer-sheets" className="text-accent text-sm">← Back to Offer Sheet</Link>
      </div>
    );
  }

  const { data: rows, error: rowsError } = await supabase
    .from("offer_sheet_rows")
    .select("id, group_key, row_data, sort_order")
    .eq("offer_sheet_id", params.sheetId)
    .order("sort_order", { ascending: true });

  if (rowsError) return <p className="text-red-600 p-6">{rowsError.message}</p>;

  const typeInfo = (sheet as any).offer_sheet_types;
  const columns: ColumnDef[] = typeInfo?.columns ?? [];

  const computedRows = computeAllRows(columns, rows ?? [], sheet.settings || {});
  // Keep sort_order alongside each computed row so the client can preserve
  // display order after inserts/edits without re-fetching.
  const rowsWithOrder = computedRows.map((r, i) => ({ ...r, sort_order: (rows ?? [])[i]?.sort_order ?? i }));

  return (
    <OfferSheetGridClient
      sheetId={sheet.id}
      sheetTitle={sheet.title}
      sectionName={typeInfo?.name ?? ""}
      period={sheet.period}
      settings={sheet.settings || {}}
      columns={columns}
      initialRows={rowsWithOrder}
    />
  );
}
