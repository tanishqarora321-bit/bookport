import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import SignInRequired from "@/components/SignInRequired";
import PartiesClient from "@/components/PartiesClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function PartiesPage() {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired />;
  const companyId = me.company_id;

  const supabase = createServiceClient();

  const [{ data: parties, error: partiesError }, { data: items, error: itemsError }] = await Promise.all([
    // Was missing the role filter entirely, so this showed every party
    // in the company regardless of role (Forwarders/Truckers/Suppliers
    // mixed in with real buyers) - fixed alongside the GST-entries build
    // since both touch this same query.
    supabase
      .from("parties")
      .select("id, legal_name, short_code, country, address, is_active, created_at, gst_entries:buyer_gst_entries(id, legal_name, gst_no, iec_code, pan_no, address, mobile, email, description_of_goods, hs_code, transit_destination, sort_order)")
      .eq("company_id", companyId)
      .contains("roles", ["buyer"])
      .order("legal_name"),
    supabase
      .from("items")
      .select("id, name, is_active, created_at")
      .eq("company_id", companyId)
      .order("name"),
  ]);

  if (partiesError) return <p className="text-red-600 p-6">{partiesError.message}</p>;
  if (itemsError) return <p className="text-red-600 p-6">{itemsError.message}</p>;

  const sortedParties = (parties ?? []).map((p: any) => ({
    ...p,
    gst_entries: (p.gst_entries ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
  }));

  return <PartiesClient initialParties={sortedParties} initialItems={items ?? []} />;
}
