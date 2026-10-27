import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import SignInRequired from "@/components/SignInRequired";
import OfferSheetsListClient from "@/components/OfferSheetsListClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function OfferSheetsPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired />;
  const companyId = me.company_id;

  const supabase = createServiceClient();

  const { data: types, error: typesError } = await supabase
    .from("offer_sheet_types")
    .select("id, name, columns, created_at")
    .eq("company_id", companyId)
    .order("created_at");

  if (typesError) return <p className="text-red-600 p-6">{typesError.message}</p>;

  const selectedTypeId = searchParams.type || types?.[0]?.id || null;

  let sheets: any[] = [];
  if (selectedTypeId) {
    const { data, error: sheetsError } = await supabase
      .from("offer_sheets")
      .select("id, title, period, notes, created_at, rows:offer_sheet_rows(count)")
      .eq("company_id", companyId)
      .eq("offer_sheet_type_id", selectedTypeId)
      .order("created_at", { ascending: false });

    if (sheetsError) return <p className="text-red-600 p-6">{sheetsError.message}</p>;
    sheets = (data ?? []).map((s: any) => ({ ...s, row_count: s.rows?.[0]?.count ?? 0 }));
  }

  return <OfferSheetsListClient types={types ?? []} selectedTypeId={selectedTypeId} sheets={sheets} isAdmin={me.role === "admin"} />;
}
