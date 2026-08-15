import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import SuppliersClient from "@/components/SuppliersClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// TEMPORARY: service-role client, no login screen built yet - see README.
// Suppliers are just `parties` rows with 'supplier' in their roles array --
// same table as Buyers/Forwarders/Truckers, same reason a party can wear
// more than one hat if that's ever true for your business.
export default async function SuppliersPage() {
  const supabase = createServiceClient();

  const { data: suppliers, error } = await supabase
    .from("parties")
    .select("id, legal_name, short_code, country, address, is_active, created_at")
    .eq("company_id", DEFAULT_COMPANY_ID)
    .contains("roles", ["supplier"])
    .order("legal_name");

  if (error) return <p className="text-red-600 p-6">{error.message}</p>;

  return <SuppliersClient initialSuppliers={suppliers ?? []} />;
}
