import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import OfferSheetsListClient from "@/components/OfferSheetsListClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// TEMPORARY: service-role client, no login screen built yet - see README.
export default async function OfferSheetsPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const supabase = createServiceClient();

  const { data: types, error: typesError } = await supabase
    .from("offer_sheet_types")
    .select("id, name, columns, created_at")
    .eq("company_id", DEFAULT_COMPANY_ID)
    .order("created_at");

  if (typesError) return <p className="text-red-600 p-6">{typesError.message}</p>;

  const selectedTypeId = searchParams.type || types?.[0]?.id || null;

  let sheets: any[] = [];
  if (selectedTypeId) {
    const { data, error: sheetsError } = await supabase
      .from("offer_sheets")
      .select("id, title, period, notes, created_at, rows:offer_sheet_rows(count)")
      .eq("company_id", DEFAULT_COMPANY_ID)
      .eq("offer_sheet_type_id", selectedTypeId)
      .order("created_at", { ascending: false });

    if (sheetsError) return <p className="text-red-600 p-6">{sheetsError.message}</p>;
    sheets = (data ?? []).map((s: any) => ({ ...s, row_count: s.rows?.[0]?.count ?? 0 }));
  }

  return <OfferSheetsListClient types={types ?? []} selectedTypeId={selectedTypeId} sheets={sheets} />;
}
