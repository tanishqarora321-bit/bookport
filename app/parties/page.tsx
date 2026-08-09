import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import PartiesClient from "@/components/PartiesClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// TEMPORARY: service-role client, no login screen built yet - see README.
export default async function PartiesPage() {
  const supabase = createServiceClient();

  const [{ data: parties, error: partiesError }, { data: items, error: itemsError }] = await Promise.all([
    supabase
      .from("parties")
      .select("id, legal_name, short_code, country, address, is_active, created_at")
      .eq("company_id", DEFAULT_COMPANY_ID)
      .order("legal_name"),
    supabase
      .from("items")
      .select("id, name, is_active, created_at")
      .eq("company_id", DEFAULT_COMPANY_ID)
      .order("name"),
  ]);

  if (partiesError) return <p className="text-red-600 p-6">{partiesError.message}</p>;
  if (itemsError) return <p className="text-red-600 p-6">{itemsError.message}</p>;

  return <PartiesClient initialParties={parties ?? []} initialItems={items ?? []} />;
}
