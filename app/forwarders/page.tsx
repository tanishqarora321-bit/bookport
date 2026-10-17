import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import SignInRequired from "@/components/SignInRequired";
import ForwardersClient from "@/components/ForwardersClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Forwarders are just `parties` rows with 'forwarder' in their roles array
// -- same table as Buyers/Customers, same reason a party can be both a
// buyer AND a forwarder if that's ever true for your business.
export default async function ForwardersPage() {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired message="Forwarders" />;
  const companyId = me.company_id;

  const supabase = createServiceClient();

  const { data: forwarders, error } = await supabase
    .from("parties")
    .select("id, legal_name, short_code, country, address, is_active, created_at")
    .eq("company_id", companyId)
    .contains("roles", ["forwarder"])
    .order("legal_name");

  if (error) return <p className="text-red-600 p-6">{error.message}</p>;

  return <ForwardersClient initialForwarders={forwarders ?? []} />;
}
