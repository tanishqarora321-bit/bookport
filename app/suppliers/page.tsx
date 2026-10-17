import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import SignInRequired from "@/components/SignInRequired";
import SuppliersClient from "@/components/SuppliersClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Suppliers are just `parties` rows with 'supplier' in their roles array --
// same table as Buyers/Forwarders/Truckers, same reason a party can wear
// more than one hat if that's ever true for your business.
export default async function SuppliersPage() {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired />;
  const companyId = me.company_id;

  const supabase = createServiceClient();

  const { data: suppliers, error } = await supabase
    .from("parties")
    .select("id, legal_name, short_code, country, address, is_active, created_at")
    .eq("company_id", companyId)
    .contains("roles", ["supplier"])
    .order("legal_name");

  if (error) return <p className="text-red-600 p-6">{error.message}</p>;

  return <SuppliersClient initialSuppliers={suppliers ?? []} />;
}
