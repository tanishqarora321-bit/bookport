import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { fetchBookingsSplitByDuplicates } from "@/lib/bookings-data";
import SignInRequired from "@/components/SignInRequired";
import BookingsClient from "@/components/BookingsClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function MultipleBookingsPage() {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired />;
  const companyId = me.company_id;

  const supabase = createServiceClient();

  const [{ error, duplicateRows }, { data: forwarders }, { data: truckers }, { data: suppliers }, { data: buyers }, { data: buyerGstEntries }] =
    await Promise.all([
      fetchBookingsSplitByDuplicates(supabase, companyId),
      supabase.from("parties").select("id, legal_name").eq("company_id", companyId).eq("is_active", true).contains("roles", ["forwarder"]).order("legal_name"),
      supabase.from("parties").select("id, legal_name").eq("company_id", companyId).eq("is_active", true).contains("roles", ["trucker"]).order("legal_name"),
      supabase.from("parties").select("id, legal_name").eq("company_id", companyId).eq("is_active", true).contains("roles", ["supplier"]).order("legal_name"),
      supabase.from("parties").select("id, legal_name").eq("company_id", companyId).eq("is_active", true).contains("roles", ["buyer"]).order("legal_name"),
      supabase
        .from("buyer_gst_entries")
        .select("id, buyer_party_id, legal_name, gst_no, iec_code, address, mobile, email, description_of_goods, hs_code, sort_order")
        .in(
          "buyer_party_id",
          (
            await supabase.from("parties").select("id").eq("company_id", companyId).contains("roles", ["buyer"])
          ).data?.map((p: { id: string }) => p.id) ?? []
        ),
    ]);

  if (error) return <p className="text-red-600 p-6">{error.message}</p>;

  return (
    <BookingsClient
      rows={duplicateRows}
      forwarders={forwarders ?? []}
      truckers={truckers ?? []}
      suppliers={suppliers ?? []}
      buyers={buyers ?? []}
      buyerGstEntries={buyerGstEntries ?? []}
      variant="multiple"
    />
  );
}
