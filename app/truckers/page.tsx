import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import SignInRequired from "@/components/SignInRequired";
import TruckersClient from "@/components/TruckersClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Truckers are just `parties` rows with 'trucker' in their roles array --
// same table as Forwarders/Buyers/Customers.
export default async function TruckersPage() {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired />;
  const companyId = me.company_id;

  const supabase = createServiceClient();

  const { data: truckers, error } = await supabase
    .from("parties")
    .select("id, legal_name, short_code, country, address, is_active, created_at")
    .eq("company_id", companyId)
    .contains("roles", ["trucker"])
    .order("legal_name");

  if (error) return <p className="text-red-600 p-6">{error.message}</p>;

  return <TruckersClient initialTruckers={truckers ?? []} isAdmin={me.role === "admin"} />;
}

