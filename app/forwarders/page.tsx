import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import ForwardersClient from "@/components/ForwardersClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// TEMPORARY: service-role client, no login screen built yet - see README.
// Forwarders are just `parties` rows with 'forwarder' in their roles array
// -- same table as Buyers/Customers, same reason a party can be both a
// buyer AND a forwarder if that's ever true for your business.
export default async function ForwardersPage() {
  const supabase = createServiceClient();

  const { data: forwarders, error } = await supabase
    .from("parties")
    .select("id, legal_name, short_code, country, address, is_active, created_at")
    .eq("company_id", DEFAULT_COMPANY_ID)
    .contains("roles", ["forwarder"])
    .order("legal_name");

  if (error) return <p className="text-red-600 p-6">{error.message}</p>;

  return <ForwardersClient initialForwarders={forwarders ?? []} />;
}
