import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import TruckersClient from "@/components/TruckersClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// TEMPORARY: service-role client, no login screen built yet - see README.
// Truckers are just `parties` rows with 'trucker' in their roles array --
// same table as Forwarders/Buyers/Customers.
export default async function TruckersPage() {
  const supabase = createServiceClient();

  const { data: truckers, error } = await supabase
    .from("parties")
    .select("id, legal_name, short_code, country, address, is_active, created_at")
    .eq("company_id", DEFAULT_COMPANY_ID)
    .contains("roles", ["trucker"])
    .order("legal_name");

  if (error) return <p className="text-red-600 p-6">{error.message}</p>;

  return <TruckersClient initialTruckers={truckers ?? []} />;
}

